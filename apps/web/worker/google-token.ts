import { z } from "zod";

import type { ServiceAccount } from "./config.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
/** Seconds the minted token is valid for; Google's own tokens use the same value. */
const TOKEN_LIFETIME_S = 3600;
/** Re-mint this long before the token actually expires, to avoid using one that
 * dies mid-request. */
const EXPIRY_SLACK_MS = 5 * 60_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().default(TOKEN_LIFETIME_S),
  })
  .describe("The part of Google's token response we need.");

/** One cached token (or in-flight mint) per service account email. */
const cache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<string>>();

/** Only for tests: clears both caches between cases. */
export const resetTokenCache = (): void => {
  cache.clear();
  inflight.clear();
};

const base64url = (bytes: ArrayBuffer | Uint8Array): string => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const base64urlJson = (value: unknown): string =>
  base64url(new TextEncoder().encode(JSON.stringify(value)));

/** The PEM may arrive with real newlines or literal "\n" escapes (double-escaped,
 * e.g. pasted into a .env or secret as a single line); either way, only the base64
 * body matters. */
const pemToArrayBuffer = (pem: string): ArrayBuffer => {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/u, "")
    .replace(/-----END PRIVATE KEY-----/u, "")
    .replaceAll("\\n", "")
    .replaceAll(/\s+/gu, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.codePointAt(i) ?? 0;
  }
  return bytes.buffer;
};

const importPrivateKey = (pem: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

/** Signs a Google service-account JWT (RS256), good for TOKEN_LIFETIME_S seconds. */
const signJwt = async (
  account: ServiceAccount,
  now: number
): Promise<string> => {
  const header = base64urlJson({ alg: "RS256", typ: "JWT" });
  const claims = base64urlJson({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + TOKEN_LIFETIME_S,
  });
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  return `${unsigned}.${base64url(signature)}`;
};

/** Exchanges a signed JWT for an access token at Google's token endpoint. */
const requestToken = async (
  account: ServiceAccount,
  fetchFn: typeof fetch,
  now: number
): Promise<CachedToken> => {
  const assertion = await signJwt(account, now);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetchFn(TOKEN_URL, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    // Never surface the response body: it can carry Google error detail we don't
    // want to leak.
    throw new Error(`Google token ${res.status}`);
  }
  const data = tokenResponseSchema.parse(await res.json());
  return { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
};

/**
 * A short-lived OAuth2 access token for the Sheets API, minted from the service
 * account's JWT and cached per `client_email` until it's close to expiry. Concurrent
 * callers share one in-flight mint; a failed mint is never cached.
 */
export const getAccessToken = (
  account: ServiceAccount,
  fetchFn: typeof fetch = fetch,
  now: () => number = Date.now
): Promise<string> => {
  const key = account.client_email;
  const nowMs = now();
  const cached = cache.get(key);
  if (cached && nowMs < cached.expiresAt - EXPIRY_SLACK_MS) {
    return Promise.resolve(cached.token);
  }

  const existing = inflight.get(key);
  if (existing) {
    return existing;
  }

  const promise = requestToken(account, fetchFn, nowMs)
    .then((result) => {
      cache.set(key, result);
      return result.token;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
};
