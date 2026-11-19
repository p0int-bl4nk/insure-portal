import { z } from "zod";

const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const siteverifySchema = z
  .object({
    success: z.boolean().catch(false),
    "error-codes": z.array(z.string()).catch([]),
  })
  .transform((data) => ({
    success: data.success,
    errorCodes: data["error-codes"],
  }))
  .describe("The parts of Cloudflare's siteverify response we use.");

export type TurnstileResult = z.output<typeof siteverifySchema>;

/** Server-side Turnstile check. Tokens are single-use and expire after 5 minutes. */
export const verifyTurnstile = async (
  token: string,
  secret: string,
  remoteIp?: string
): Promise<TurnstileResult> => {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }
  const res = await fetch(SITEVERIFY_URL, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    return { success: false, errorCodes: [`http_${res.status}`] };
  }
  return siteverifySchema.parse(await res.json());
};
