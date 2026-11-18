import type { Lead, SubmitResponse } from "@insure/shared";

export interface SubmitPayload {
  lead: Lead;
  turnstileToken: string;
  website: string;
  startedAt: number;
}

/** POSTs the lead. Never throws: network and unexpected responses map to "unavailable". */
export const submitLead = async (
  payload: SubmitPayload
): Promise<SubmitResponse> => {
  try {
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as SubmitResponse | null;
    if (data && typeof data.ok === "boolean") {
      return data;
    }
  } catch {
    // Fall through to "unavailable".
  }
  return { ok: false, error: "unavailable" };
};
