import { describe, expect, it } from "vitest";

import {
  importReplayPrivateKey,
  importReplayPublicKey,
  openReplay,
  sealReplay,
} from "./replay.ts";
import type {
  ReplayPayload,
  ReplayPrivateJwk,
  ReplayPublicJwk,
} from "./replay.ts";

const keyPair = async () => {
  const { publicKey, privateKey } = (await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  )) as CryptoKeyPair;
  return {
    publicKey: await importReplayPublicKey(
      (await crypto.subtle.exportKey("jwk", publicKey)) as ReplayPublicJwk
    ),
    privateKey: await importReplayPrivateKey(
      (await crypto.subtle.exportKey("jwk", privateKey)) as ReplayPrivateJwk
    ),
  };
};

const PAYLOAD: ReplayPayload = {
  kind: "rows",
  leadId: "7f3a21c9-0000-4000-8000-000000000000",
  leadRow: ["7f3a21c9", "Rahul Menon", 2, "Yes"],
  memberRows: [["7f3a21c9", "Self", "Diabetes"]],
};

describe(sealReplay, () => {
  it("round-trips through the private key", async () => {
    const { publicKey, privateKey } = await keyPair();
    const sealed = await sealReplay(publicKey, PAYLOAD);

    expect(sealed).toMatch(/^v1(?:\.[\w-]+){3}$/u);
    expect(sealed).not.toContain("Rahul");
    await expect(openReplay(privateKey, sealed)).resolves.toStrictEqual(
      PAYLOAD
    );
  });

  it("can't be opened with another key", async () => {
    const { publicKey } = await keyPair();
    const other = await keyPair();
    const sealed = await sealReplay(publicKey, PAYLOAD);

    await expect(openReplay(other.privateKey, sealed)).rejects.toMatchObject({
      name: "OperationError",
    });
  });

  it("rejects anything that isn't a v1 payload", async () => {
    const { privateKey } = await keyPair();

    await expect(openReplay(privateKey, "v2.a.b.c")).rejects.toThrow(
      "Not a v1 replay payload"
    );
  });
});
