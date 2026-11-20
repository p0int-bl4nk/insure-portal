import { submissionSchema } from "@insure/shared";
import type { SubmitResponse } from "@insure/shared";
import { z } from "zod";

import type { AlertEvent } from "./alert.ts";
import { postAlert } from "./alert.ts";
import type { Config } from "./config.ts";
import { log } from "./log.ts";
import type { Logger } from "./log.ts";
import { leadToRows } from "./rows.ts";
import type { Cell } from "./rows.ts";
import { appendLead } from "./sheets.ts";
import { verifyTurnstile } from "./turnstile.ts";
import type { TurnstileResult } from "./turnstile.ts";
import { jsonText, toReference } from "./utils.ts";

const MAX_BODY_BYTES = 16 * 1024;
/** Nobody completes three steps this fast; faster submissions are scripted. */
const MIN_FILL_MS = 3000;

/** Side effects, injected so tests can replace them. Types follow the real implementations. */
export interface Deps {
  /** Set only when TURNSTILE_ENABLED=true; otherwise submissions skip the human check. */
  verify:
    | ((token: string, remoteIp?: string) => Promise<TurnstileResult>)
    | undefined;
  append: (leadRow: Cell[], memberRows: Cell[][]) => Promise<void>;
  now: () => Date;
  newId: () => string;
  log: Logger;
  /** Fires on a failure that loses a lead. Never throws. */
  alert: (event: AlertEvent, leadId?: string) => void;
}

const json = (
  status: number,
  body:
    | SubmitResponse
    | { ok: false; error: "method_not_allowed" | "too_large" }
): Response =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

const botSignal = (nowMs: number) =>
  z
    .union([
      z
        .object({ website: z.string().min(1) })
        .transform(() => "honeypot" as const)
        .describe('Honeypot: the hidden "website" field was filled in.'),
      z
        .object({ startedAt: z.number().gt(nowMs - MIN_FILL_MS) })
        .transform(() => "too_fast" as const)
        .describe("Form completed within MIN_FILL_MS of being shown."),
    ])
    .optional()
    .catch(undefined)
    .describe(
      "Why a body looks scripted, or undefined for a human-looking one. Read leniently (any other shape counts as human) because full validation comes next."
    );

/** Returned to bots so they can't tell they were filtered out. Nothing is written. */
const decoy = (deps: Deps) =>
  json(200, { ok: true, reference: toReference(deps.newId()) });

const clientIp = (request: Request): string | undefined =>
  request.headers.get("cf-connecting-ip") ?? undefined;

/**
 * Reads a request body up to `maxBytes`, without ever buffering more than that.
 * A chunked request with no Content-Length can otherwise stream up to the
 * platform's full request-size cap before `text()` resolves, risking an
 * out-of-memory isolate reset. Returns "too_large" (and cancels the stream)
 * the moment the running total crosses the limit, instead of draining it.
 */
const readChunks = async (
  reader: ReadableStreamDefaultReader<Uint8Array>,
  maxBytes: number
): Promise<Uint8Array[] | "too_large"> => {
  const chunks: Uint8Array[] = [];
  let total = 0;

  // Chunks arrive in order, so each read must wait for the previous one.
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) {
      return chunks;
    }

    total += value.byteLength;
    if (total > maxBytes) {
      // oxlint-disable-next-line no-await-in-loop
      await reader.cancel();
      return "too_large";
    }

    chunks.push(value);
  }
};

const readBody = async (
  request: Request,
  maxBytes: number
): Promise<string | "too_large"> => {
  if (!request.body) {
    return "";
  }

  const chunks = await readChunks(request.body.getReader(), maxBytes);
  if (chunks === "too_large") {
    return "too_large";
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
};

export const createHandler =
  (deps: Deps) =>
  async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" });
    }

    const declaredLength = Number(request.headers.get("content-length"));
    if (
      Number.isFinite(declaredLength) &&
      declaredLength > 0 &&
      declaredLength > MAX_BODY_BYTES
    ) {
      return json(413, { ok: false, error: "too_large" });
    }

    let raw: string;
    try {
      const result = await readBody(request, MAX_BODY_BYTES);
      if (result === "too_large") {
        return json(413, { ok: false, error: "too_large" });
      }
      raw = result;
    } catch {
      deps.log.warn("lead_rejected", { reason: "body_unreadable" });
      return json(400, { ok: false, error: "invalid" });
    }

    const body = jsonText.safeParse(raw);
    if (!body.success) {
      return json(400, { ok: false, error: "invalid" });
    }

    // Bot checks run before full validation and get a decoy success.
    const botReason = botSignal(deps.now().getTime()).parse(body.data);
    if (botReason) {
      deps.log.warn("lead_rejected", { reason: botReason });
      return decoy(deps);
    }

    const parsed = submissionSchema.safeParse(body.data);
    if (!parsed.success) {
      deps.log.warn("lead_rejected", {
        reason: "invalid",
        // Paths only, never values.
        paths: parsed.error.issues.map((i) => i.path.join(".")).join(","),
      });
      return json(400, { ok: false, error: "invalid" });
    }

    if (deps.verify) {
      const { turnstileToken } = parsed.data;
      if (!turnstileToken) {
        deps.log.warn("lead_rejected", { reason: "turnstile_missing" });
        return json(403, { ok: false, error: "verification_failed" });
      }

      let verified: TurnstileResult;
      try {
        verified = await deps.verify(turnstileToken, clientIp(request));
      } catch (error) {
        deps.log.error("turnstile_unreachable", { message: String(error) });
        deps.alert("turnstile_unreachable");
        return json(503, { ok: false, error: "unavailable" });
      }

      if (!verified.success) {
        deps.log.warn("lead_rejected", {
          reason: "turnstile",
          codes: verified.errorCodes.join(","),
        });
        return json(403, { ok: false, error: "verification_failed" });
      }
    }

    const { lead } = parsed.data;
    const leadId = deps.newId();
    const { leadRow, memberRows } = leadToRows(lead, leadId, deps.now());
    try {
      await deps.append(leadRow, memberRows);
    } catch (error) {
      deps.log.error("sheet_write_failed", { leadId, message: String(error) });
      deps.alert("sheet_write_failed", leadId);
      return json(503, { ok: false, error: "unavailable" });
    }

    deps.log.info("lead_saved", { leadId, members: memberRows.length });
    return json(200, { ok: true, reference: toReference(leadId) });
  };

/** Real dependencies for a loaded config. */
export const liveDeps = (
  config: Config,
  waitUntil: (p: Promise<unknown>) => void
): Deps => {
  const { turnstile, alertWebhookUrl } = config;

  return {
    verify: turnstile.enabled
      ? (token, remoteIp) =>
          verifyTurnstile(token, turnstile.secretKey, remoteIp)
      : undefined,
    append: (leadRow, memberRows) =>
      appendLead(
        config.googleServiceAccount,
        config.sheet,
        leadRow,
        memberRows
      ),
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
    log,
    alert: alertWebhookUrl
      ? (event, leadId) => waitUntil(postAlert(alertWebhookUrl, event, leadId))
      : () => {
          // No webhook configured: nothing to alert.
        },
  };
};
