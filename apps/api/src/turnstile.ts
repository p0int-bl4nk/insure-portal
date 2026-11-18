const SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Server-side Turnstile check. Tokens are single-use and expire after 5 minutes. */
export const verifyTurnstile = async (
  token: string,
  secret: string,
  remoteIp?: string
): Promise<{ success: boolean; errorCodes: string[] }> => {
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
  const data = (await res.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };
  return {
    success: data.success === true,
    errorCodes: data["error-codes"] ?? [],
  };
};
