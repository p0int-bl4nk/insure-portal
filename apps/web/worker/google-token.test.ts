import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceAccount } from "./config.ts";
import { getAccessToken, resetTokenCache } from "./google-token.ts";

/** Base64url-decodes one JWT segment into its JSON claims/header. */
const decodeSegment = (segment: string): Record<string, unknown> => {
  const padded = segment.replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(atob(padded)) as Record<string, unknown>;
};

/** A `now` that never advances; most cases don't care about the clock. */
const FIXED_NOW = () => 0;

/** Builds a fake fetchFn that resolves with a Google-shaped token response. */
const okFetch = (expiresIn = 3600) =>
  vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json({ access_token: "tok-1", expires_in: expiresIn })
    )
  );

/** Reads out the `assertion` posted to the token endpoint, split into its 3 segments. */
const assertionSegments = (body: unknown): [string, string, string] => {
  const { assertion } = Object.fromEntries(body as URLSearchParams);
  const [headerSeg, claimsSeg, sigSeg] = (assertion ?? "").split(".");
  if (!(headerSeg && claimsSeg && sigSeg)) {
    throw new Error("no assertion in posted body");
  }
  return [headerSeg, claimsSeg, sigSeg];
};

/** Verifies a JWT's signature segment against the signed header+claims, using the
 * given public key. Shared by every case that needs to prove signing (not just
 * mock plumbing) actually happened. */
const verifiesWithKey = async (
  [headerSeg, claimsSeg, sigSeg]: [string, string, string],
  publicKey: CryptoKey
): Promise<boolean> => {
  const sigBytes = Uint8Array.from(
    atob(sigSeg.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.codePointAt(0) ?? 0
  );
  const signedData = new TextEncoder().encode(`${headerSeg}.${claimsSeg}`);
  return await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    sigBytes,
    signedData
  );
};

describe(getAccessToken, () => {
  let account: ServiceAccount;
  let publicKey: CryptoKey;

  beforeEach(async () => {
    resetTokenCache();
    // workerd types widen these results; RSA generateKey always yields a pair.
    const keyPair = (await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"]
    )) as CryptoKeyPair;
    ({ publicKey } = keyPair);
    const pkcs8 = (await crypto.subtle.exportKey(
      "pkcs8",
      keyPair.privateKey
    )) as ArrayBuffer;
    const base64 = btoa(String.fromCodePoint(...new Uint8Array(pkcs8)));
    const pem = `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`;
    account = {
      client_email: "svc@example.iam.gserviceaccount.com",
      private_key: pem,
    };
  });

  it("signs a JWT with the right header and claims", async () => {
    const fetchFn = okFetch();
    await getAccessToken(account, fetchFn, FIXED_NOW);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const [headerSeg, claimsSeg] = assertionSegments(init.body);
    expect(decodeSegment(headerSeg)).toStrictEqual({
      alg: "RS256",
      typ: "JWT",
    });

    const claims = decodeSegment(claimsSeg);
    expect(claims).toMatchObject({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
    });
    expect((claims.exp as number) - (claims.iat as number)).toBe(3600);
  });

  it("signs a JWT Google can verify with its own public key", async () => {
    const fetchFn = okFetch();
    await getAccessToken(account, fetchFn, FIXED_NOW);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const valid = await verifiesWithKey(
      assertionSegments(init.body),
      publicKey
    );
    expect(valid).toBeTruthy();
  });

  it("reuses the token while valid", async () => {
    const fetchFn = okFetch();
    await getAccessToken(account, fetchFn, FIXED_NOW);
    await getAccessToken(account, fetchFn, FIXED_NOW);
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it("re-mints a token 5 minutes before expiry", async () => {
    const fetchFn = okFetch(3600);
    await getAccessToken(account, fetchFn, FIXED_NOW);
    await getAccessToken(account, fetchFn, () => 3600 * 1000 - 5 * 60_000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed token request", async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(
        Response.json({ access_token: "tok-2", expires_in: 3600 })
      );

    await expect(getAccessToken(account, fetchFn, FIXED_NOW)).rejects.toThrow(
      "Google token 500"
    );

    const token = await getAccessToken(account, fetchFn, FIXED_NOW);
    expect(token).toBe("tok-2");
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("accepts a PEM with literal \\n escapes instead of real newlines", async () => {
    // A key pasted into a secret or .env as one line keeps "\n" as two literal
    // characters (backslash + n) rather than an actual newline.
    const escapedPem = account.private_key.replaceAll("\n", "\\n");
    const escapedAccount: ServiceAccount = {
      ...account,
      private_key: escapedPem,
      client_email: "escaped@example.iam.gserviceaccount.com",
    };
    const fetchFn = okFetch();

    const token = await getAccessToken(escapedAccount, fetchFn, FIXED_NOW);

    expect(token).toBe("tok-1");
    expect(fetchFn).toHaveBeenCalledOnce();

    // The escaped PEM must parse to the SAME key: a wrong signature would mean
    // the escape-stripping silently corrupted the key material.
    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    const valid = await verifiesWithKey(
      assertionSegments(init.body),
      publicKey
    );
    expect(valid).toBeTruthy();
  });

  it("shares one in-flight request", async () => {
    const fetchFn = okFetch();
    const [a, b] = await Promise.all([
      getAccessToken(account, fetchFn, FIXED_NOW),
      getAccessToken(account, fetchFn, FIXED_NOW),
    ]);
    expect(a).toBe("tok-1");
    expect(b).toBe("tok-1");
    expect(fetchFn).toHaveBeenCalledOnce();
  });
});
