import { log } from "./log.ts";

/** Failure modes that lose a lead and so page a human via Google Chat. */
export type AlertEvent = "sheet_write_failed" | "turnstile_unreachable";

const TIMEOUT_MS = 5000;

/**
 * Posts a Google Chat incoming-webhook message. Never rejects: a failure to alert
 * is logged (status or error message only, never the webhook URL) and swallowed,
 * since the caller is already on a failure path and must not fail harder because
 * alerting failed too.
 */
export const postAlert = async (
  webhookUrl: string,
  event: AlertEvent,
  leadId: string | undefined,
  fetchFn: typeof fetch = fetch
): Promise<void> => {
  const text = `insure-portal: ${event}${leadId ? ` (lead ${leadId})` : ""}`;
  try {
    const res = await fetchFn(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      log.warn("alert_failed", { status: res.status });
    }
  } catch (error) {
    log.warn("alert_failed", {
      name: error instanceof Error ? error.name : "unknown",
    });
  }
};
