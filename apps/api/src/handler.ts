import { randomUUID } from "node:crypto";

import { submissionSchema } from "@insure/shared";
import type { Lead, SubmitResponse } from "@insure/shared";
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from "aws-lambda";

import { log } from "./log.ts";
import type { Logger } from "./log.ts";
import { leadToRows, toReference } from "./rows.ts";
import type { Cell } from "./rows.ts";
import { getSecrets } from "./secrets.ts";
import { SheetsClient, sheetConfigFromEnv } from "./sheets.ts";
import { verifyTurnstile } from "./turnstile.ts";

const MAX_BODY_BYTES = 16 * 1024;
/** Nobody completes three steps this fast; faster submissions are scripted. */
const MIN_FILL_MS = 3000;

export interface Deps {
  verify: (
    token: string,
    remoteIp?: string
  ) => Promise<{ success: boolean; errorCodes: string[] }>;
  append: (leadRow: Cell[], memberRows: Cell[][]) => Promise<void>;
  now: () => Date;
  newId: () => string;
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

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { ok: false, error: "invalid" });
    }

    // Bot checks before validation, answered with a decoy success.
    const candidate = body as { website?: unknown; startedAt?: unknown };
    if (typeof candidate.website === "string" && candidate.website !== "") {
      deps.log.warn("lead_rejected", { reason: "honeypot" });
      return decoy(deps);
    }
    if (
      typeof candidate.startedAt === "number" &&
      deps.now().getTime() - candidate.startedAt < MIN_FILL_MS
    ) {
      deps.log.warn("lead_rejected", { reason: "too_fast" });
      return decoy(deps);
    }

    const parsed = submissionSchema.safeParse(body);
    if (!parsed.success) {
      deps.log.warn("lead_rejected", {
        reason: "invalid",
        // Paths only, never values.
        paths: parsed.error.issues.map((i) => i.path.join(".")).join(","),
      });
      return json(400, { ok: false, error: "invalid" });
    }

    let verified: Awaited<ReturnType<Deps["verify"]>>;
    try {
      verified = await deps.verify(parsed.data.turnstileToken, clientIp(event));
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

    const lead: Lead = parsed.data.lead;
    const leadId = deps.newId();
    const { leadRow, memberRows } = leadToRows(lead, leadId, deps.now());
    try {
      await deps.append(leadRow, memberRows);
    } catch (error) {
      deps.log.error("sheet_write_failed", { leadId, message: String(error) });
      return json(503, { ok: false, error: "unavailable" });
    }

    deps.log.info("lead_saved", { leadId, members: lead.members.length });
    return json(200, { ok: true, reference: toReference(leadId) });
  };

let sheets: SheetsClient | undefined;

export const handler = createHandler({
  verify: async (token, remoteIp) => {
    const { turnstileSecretKey } = await getSecrets();
    return verifyTurnstile(token, turnstileSecretKey, remoteIp);
  },
  append: async (leadRow, memberRows) => {
    if (!sheets) {
      const { googleServiceAccount } = await getSecrets();
      sheets = new SheetsClient(googleServiceAccount, sheetConfigFromEnv());
    }
    await sheets.appendLead(leadRow, memberRows);
  },
  now: () => new Date(),
  newId: randomUUID,
  log,
});
