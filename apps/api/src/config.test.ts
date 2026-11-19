import { describe, expect, it } from "vitest";

import { parseConfig } from "./config.ts";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc";
const AWS = { SPREADSHEET_ID: ID, APP_SECRET_ID: "arn:secret" };
const SERVICE_ACCOUNT = { client_email: "a@b.iam", private_key: "key" };

describe(parseConfig, () => {
  it("applies defaults", () => {
    expect(parseConfig(AWS)).toStrictEqual({
      sheet: { spreadsheetId: ID, leadsTab: "Leads", membersTab: "Members" },
      turnstileEnabled: false,
      port: 8787,
      secrets: { kind: "secretsManager", secretId: "arn:secret" },
    });
  });

  it("parses flags and numbers from strings", () => {
    const config = parseConfig({
      ...AWS,
      TURNSTILE_ENABLED: "true",
      PORT: "9000",
    });
    expect(config).toMatchObject({ turnstileEnabled: true, port: 9000 });
  });

  it("reads local secrets when there is no APP_SECRET_ID", () => {
    const config = parseConfig({
      SPREADSHEET_ID: ID,
      GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT),
    });
    expect(config.secrets).toStrictEqual({
      kind: "env",
      secrets: {
        googleServiceAccount: SERVICE_ACCOUNT,
        turnstileSecretKey: undefined,
      },
    });
  });

  it("rejects values that aren't a Sheet ID", () => {
    expect(() =>
      parseConfig({
        ...AWS,
        SPREADSHEET_ID: `https://docs.google.com/spreadsheets/d/${ID}/edit`,
      })
    ).toThrow("SPREADSHEET_ID must be the Sheet ID from its URL");
  });

  it("rejects a missing secrets source", () => {
    expect(() => parseConfig({ SPREADSHEET_ID: ID })).toThrow(
      "Invalid environment"
    );
  });
});
