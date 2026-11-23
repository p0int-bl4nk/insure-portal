import type { Cell } from "./rows.ts";

/** A failed submission, sealed into the logs so it can be replayed later. */
export type ReplayPayload =
  | {
      /** A valid lead that was never saved: append these rows to replay it. */
      kind: "rows";
      leadId: string;
      leadRow: Cell[];
      memberRows: Cell[][];
    }
  | {
      /** A rejected request body, as received, without its Turnstile token. */
      kind: "body";
      receivedAt: string;
      body: unknown;
    };

/** The fields of the RSA public key that REPLAY_PUBLIC_KEY holds. */
export interface ReplayPublicJwk {
  kty: "RSA";
  n: string;
  e: string;
}

/** As written by `replay:keygen`: the public fields plus the private ones. */
export type ReplayPrivateJwk = ReplayPublicJwk & Record<string, string>;

const RSA_OAEP = { name: "RSA-OAEP", hash: "SHA-256" } as const;
const VERSION = "v1";

const toBase64Url = (bytes: ArrayBuffer | Uint8Array): string => {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/[=]+$/u, "");
};

const fromBase64Url = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(
    atob(text.replaceAll("-", "+").replaceAll("_", "/")),
    (char) => char.codePointAt(0) ?? 0
  );

export const importReplayPublicKey = (jwk: ReplayPublicJwk) =>
  crypto.subtle.importKey("jwk", jwk, RSA_OAEP, false, ["encrypt"]);

export const importReplayPrivateKey = (jwk: ReplayPrivateJwk) =>
  crypto.subtle.importKey("jwk", jwk, RSA_OAEP, false, ["decrypt"]);

/**
 * Encrypts a payload for the logs: a fresh AES-256-GCM key per payload, wrapped
 * with the RSA public key. Returns "v1.<wrapped key>.<iv>.<ciphertext>".
 */
export const sealReplay = async (
  publicKey: CryptoKey,
  payload: ReplayPayload
): Promise<string> => {
  const aesKey = (await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt"]
  )) as CryptoKey;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    new TextEncoder().encode(JSON.stringify(payload))
  );
  const wrappedKey = await crypto.subtle.encrypt(
    RSA_OAEP,
    publicKey,
    (await crypto.subtle.exportKey("raw", aesKey)) as ArrayBuffer
  );

  return [VERSION, wrappedKey, iv, ciphertext]
    .map((part) => (typeof part === "string" ? part : toBase64Url(part)))
    .join(".");
};

export const openReplay = async (
  privateKey: CryptoKey,
  sealed: string
): Promise<ReplayPayload> => {
  const [version, wrappedKey, iv, ciphertext, ...rest] = sealed
    .trim()
    .split(".");
  if (
    version !== VERSION ||
    !wrappedKey ||
    !iv ||
    !ciphertext ||
    rest.length > 0
  ) {
    throw new Error(`Not a ${VERSION} replay payload`);
  }

  const rawKey = await crypto.subtle.decrypt(
    RSA_OAEP,
    privateKey,
    fromBase64Url(wrappedKey)
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv) },
    aesKey,
    fromBase64Url(ciphertext)
  );

  return JSON.parse(new TextDecoder().decode(plaintext)) as ReplayPayload;
};
