import { randomUUID } from "node:crypto";

import { submissionSchema } from "@insure/shared";
import type { SubmitResponse } from "@insure/shared";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";
import { z } from "zod";

import { getConfig } from "./config.ts";
import { log } from "./log.ts";
import type { Logger } from "./log.ts";
import { leadToRows } from "./rows.ts";
import { getSecrets } from "./secrets.ts";
import { SheetsClient } from "./sheets.ts";
import { verifyTurnstile } from "./turnstile.ts";
import type { TurnstileResult } from "./turnstile.ts";
import { jsonText, toReference } from "./utils.ts";

const MAX_BODY_BYTES = 16 * 1024;
/** Nobody completes three steps this fast; faster submissions are scripted. */
const MIN_FILL_MS = 3000;

/** Side effects, injected so tests can replace them. Types follow the real implementations. */
export interface Deps {
  /** On only when TURNSTILE_ENABLED=true; otherwise submissions skip the human check. */
  turnstileEnabled: boolean;
  verify: (token: string, remoteIp?: string) => Promise<TurnstileResult>;
  append: SheetsClient["appendLead"];
  now: () => Date;
  newId: typeof randomUUID;
  log: Logger;
}

const json = (
  statusCode: number,
  body:
    | SubmitResponse
    | { ok: false; error: "method_not_allowed" | "too_large" }
): APIGatewayProxyStructuredResultV2 => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body),
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

const clientIp = (event: APIGatewayProxyEventV2): string | undefined =>
  event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  event.requestContext.http.sourceIp;

export const createHandler =
  (deps: Deps) =>
  async (
    event: APIGatewayProxyEventV2
  ): Promise<APIGatewayProxyStructuredResultV2> => {
    if (event.requestContext.http.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" });
    }

    const raw = event.isBase64Encoded
      ? Buffer.from(event.body ?? "", "base64").toString("utf-8")
      : (event.body ?? "");
    if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
      return json(413, { ok: false, error: "too_large" });
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

    if (deps.turnstileEnabled) {
      const { turnstileToken } = parsed.data;
      if (!turnstileToken) {
        deps.log.warn("lead_rejected", { reason: "turnstile_missing" });
        return json(403, { ok: false, error: "verification_failed" });
      }

      let verified: TurnstileResult;
      try {
        verified = await deps.verify(turnstileToken, clientIp(event));
      } catch (error) {
        deps.log.error("turnstile_unreachable", { message: String(error) });
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
      return json(503, { ok: false, error: "unavailable" });
    }

    deps.log.info("lead_saved", { leadId, members: memberRows.length });
    return json(200, { ok: true, reference: toReference(leadId) });
  };

/** Real dependencies, built from the config on first use. */
const liveDeps = (): Deps => {
  const config = getConfig();
  let sheets: SheetsClient | undefined;

  return {
    turnstileEnabled: config.turnstileEnabled,
    verify: async (token, remoteIp) => {
      const { turnstileSecretKey } = await getSecrets(config.secrets);
      if (!turnstileSecretKey) {
        throw new Error("Turnstile is enabled but no secret key is configured");
      }

      return verifyTurnstile(token, turnstileSecretKey, remoteIp);
    },
    append: async (leadRow, memberRows) => {
      if (!sheets) {
        const { googleServiceAccount } = await getSecrets(config.secrets);
        sheets = new SheetsClient(googleServiceAccount, config.sheet);
      }
      await sheets.appendLead(leadRow, memberRows);
    },
    now: () => new Date(),
    newId: randomUUID,
    log,
  };
};

let live: ReturnType<typeof createHandler> | undefined;

export const handler = (event: APIGatewayProxyEventV2) => {
  live ??= createHandler(liveDeps());

  return live(event);
};
