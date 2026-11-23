import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.ts";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc";
const SERVICE_ACCOUNT = { client_email: "a@b.iam", private_key: "key" };
const ENV = {
  SPREADSHEET_ID: ID,
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT),
};

describe(loadConfig, () => {
  it("applies defaults", () => {
    expect(loadConfig(ENV)).toStrictEqual({
      sheet: { spreadsheetId: ID, leadsTab: "Leads", membersTab: "Members" },
      turnstile: { enabled: false },
      alertWebhookUrl: undefined,
      replayPublicKey: undefined,
      googleServiceAccount: SERVICE_ACCOUNT,
    });
  });

  it("reads the replay public key", () => {
    const jwk = { kty: "RSA", n: "abc", e: "AQAB", alg: "RSA-OAEP-256" };
    expect(
      loadConfig({ ...ENV, REPLAY_PUBLIC_KEY: JSON.stringify(jwk) })
    ).toMatchObject({ replayPublicKey: { kty: "RSA", n: "abc", e: "AQAB" } });
  });

  it("refuses a private key as the replay key", () => {
    const jwk = { kty: "RSA", n: "abc", e: "AQAB", d: "secret" };
    expect(() =>
      loadConfig({ ...ENV, REPLAY_PUBLIC_KEY: JSON.stringify(jwk) })
    ).toThrow("must be the public key, not the private one");
  });

  it("parses TURNSTILE_ENABLED from a string", () => {
    expect(
      loadConfig({
        ...ENV,
        TURNSTILE_ENABLED: "true",
        TURNSTILE_SECRET_KEY: "secret",
      })
    ).toMatchObject({ turnstile: { enabled: true, secretKey: "secret" } });
  });

  it("rejects values that aren't a Sheet ID", () => {
    expect(() =>
      loadConfig({
        ...ENV,
        SPREADSHEET_ID: `https://docs.google.com/spreadsheets/d/${ID}/edit`,
      })
    ).toThrow("SPREADSHEET_ID must be the Sheet ID from its URL");
  });

  it("rejects a missing service account", () => {
    expect(() => loadConfig({ SPREADSHEET_ID: ID })).toThrow(
      "Invalid environment"
    );
  });

  it("requires a Turnstile secret key while Turnstile is on", () => {
    expect(() => loadConfig({ ...ENV, TURNSTILE_ENABLED: "true" })).toThrow(
      "no Turnstile secret key is configured"
    );
  });

  it("rejects a webhook URL that isn't Google Chat", () => {
    expect(() =>
      loadConfig({ ...ENV, ALERT_WEBHOOK_URL: "https://evil.example/x" })
    ).toThrow("Invalid environment");
  });

  it("rejects a malformed webhook URL with a clear message, not a crash", () => {
    expect(() =>
      loadConfig({ ...ENV, ALERT_WEBHOOK_URL: "not a url" })
    ).toThrow("Invalid environment");
  });

  it("ignores non-string bindings", () => {
    expect(loadConfig({ ...ENV, ASSETS: {} })).toMatchObject({
      sheet: { spreadsheetId: ID },
    });
  });
});
