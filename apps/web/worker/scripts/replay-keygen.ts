// One-off setup: creates the key pair that failed submissions are encrypted to.
// Usage: pnpm --filter web replay:keygen [private-key-file]   (default: replay-private-key.json)
import { writeFileSync } from "node:fs";

const file = process.argv[2] ?? "replay-private-key.json";

const { publicKey, privateKey } = await crypto.subtle.generateKey(
  {
    name: "RSA-OAEP",
    modulusLength: 3072,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["encrypt", "decrypt"]
);

writeFileSync(
  file,
  JSON.stringify(await crypto.subtle.exportKey("jwk", privateKey)),
  { flag: "wx", mode: 0o600 }
);

const { kty, n, e } = await crypto.subtle.exportKey("jwk", publicKey);
console.info(`Private key written to ${file}. Keep it out of git and somewhere safe.

Set this as REPLAY_PUBLIC_KEY in wrangler.jsonc vars:
${JSON.stringify({ kty, n, e })}`);
