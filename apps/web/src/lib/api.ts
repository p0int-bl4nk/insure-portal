import { submitResponseSchema } from "@insure/shared";
import type { SubmitResponse, Submission } from "@insure/shared";

const UNAVAILABLE: SubmitResponse = { ok: false, error: "unavailable" };

/** POSTs the lead. Never throws: network errors and unexpected responses map to "unavailable". */
export const submitLead = async (
  submission: Submission
): Promise<SubmitResponse> => {
  try {
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submission),
    });

    const parsed = submitResponseSchema.safeParse(await res.json());

    return parsed.success ? parsed.data : UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
};
