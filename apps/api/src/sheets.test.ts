import { describe, expect, it } from "vitest";

import { sheetConfigFromEnv } from "./sheets.ts";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc";

describe(sheetConfigFromEnv, () => {
  it("accepts a bare Sheet ID", () => {
    expect(sheetConfigFromEnv({ SPREADSHEET_ID: ID })).toStrictEqual({
      spreadsheetId: ID,
      leadsTab: "Leads",
      membersTab: "Members",
    });
  });

  it("extracts the ID from a pasted Sheet URL", () => {
    const url = `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`;
    expect(sheetConfigFromEnv({ SPREADSHEET_ID: url }).spreadsheetId).toBe(ID);
  });

  it("rejects values that aren't a Sheet ID", () => {
    expect(() =>
      sheetConfigFromEnv({ SPREADSHEET_ID: "https://example.com" })
    ).toThrow("SPREADSHEET_ID must be the Sheet ID from its URL");
  });
});
