import { describe, expect, it, vi } from "vitest";

import { loadConfig, parseEnv } from "./config.ts";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc";
const SERVICE_ACCOUNT = { client_email: "a@b.iam", private_key: "key" };
const AWS = { SPREADSHEET_ID: ID, APP_SECRET_ID: "arn:secret" };
const LOCAL = {
  SPREADSHEET_ID: ID,
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SERVICE_ACCOUNT),
};

describe(parseEnv, () => {
  it("applies defaults", () => {
    expect(parseEnv(AWS)).toStrictEqual({
      sheet: { spreadsheetId: ID, leadsTab: "Leads", membersTab: "Members" },
      turnstileEnabled: false,
      port: 8787,
      secrets: { kind: "secretsManager", secretId: "arn:secret" },
    });
  });

  it("parses flags and numbers from strings", () => {
    expect(
      parseEnv({ ...AWS, TURNSTILE_ENABLED: "true", PORT: "9000" })
    ).toMatchObject({ turnstileEnabled: true, port: 9000 });
  });

  it("rejects values that aren't a Sheet ID", () => {
    expect(() =>
      parseEnv({
        ...AWS,
        SPREADSHEET_ID: `https://docs.google.com/spreadsheets/d/${ID}/edit`,
      })
    ).toThrow("SPREADSHEET_ID must be the Sheet ID from its URL");
  });

  it("rejects a missing secrets source", () => {
    expect(() => parseEnv({ SPREADSHEET_ID: ID })).toThrow(
      "Invalid environment"
    );
  });
});

describe(loadConfig, () => {
  it("reads local secrets from env vars", async () => {
    await expect(loadConfig(LOCAL)).resolves.toStrictEqual({
      sheet: { spreadsheetId: ID, leadsTab: "Leads", membersTab: "Members" },
      port: 8787,
      googleServiceAccount: SERVICE_ACCOUNT,
      turnstile: { enabled: false },
    });
  });

  it("fetches the Secrets Manager secret when APP_SECRET_ID is set", async () => {
    const fetchSecret = vi
      .fn<NonNullable<Parameters<typeof loadConfig>[1]>>()
      .mockResolvedValue(
        JSON.stringify({
          googleServiceAccount: SERVICE_ACCOUNT,
          turnstileSecretKey: "secret",
        })
      );

    const config = await loadConfig(
      { ...AWS, TURNSTILE_ENABLED: "true" },
      fetchSecret
    );

    expect(fetchSecret).toHaveBeenCalledWith("arn:secret");
    expect(config.turnstile).toStrictEqual({
      enabled: true,
      secretKey: "secret",
    });
  });

  it("requires a Turnstile secret key while Turnstile is on", async () => {
    await expect(
      loadConfig({ ...LOCAL, TURNSTILE_ENABLED: "true" })
    ).rejects.toThrow("no Turnstile secret key is configured");
  });
});
