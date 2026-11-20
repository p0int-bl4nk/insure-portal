import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServiceAccount, SheetConfig } from "./config.ts";

vi.mock(import("./google-token.ts"), () => ({
  getAccessToken: vi.fn<() => Promise<string>>(() =>
    Promise.resolve("fake-token")
  ),
}));

const { appendLead, ensureTabs, resetTabCache } = await import("./sheets.ts");

const ACCOUNT: ServiceAccount = {
  client_email: "svc@example.iam.gserviceaccount.com",
  private_key: "irrelevant-here",
};
const SHEET: SheetConfig = {
  spreadsheetId: "sheet-1",
  leadsTab: "Leads",
  membersTab: "Members",
};

const metadataResponse = () =>
  Response.json({
    sheets: [
      { properties: { sheetId: 10, title: "Leads" } },
      { properties: { sheetId: 20, title: "Members" } },
    ],
  });

describe(appendLead, () => {
  beforeEach(() => {
    resetTabCache();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("appends lead and members in one batchUpdate", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce(metadataResponse())
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await appendLead(ACCOUNT, SHEET, ["Alice", 42], [["Bob", "=SUM(A1)"]]);

    const batchCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes(":batchUpdate")
    );
    expect(batchCalls).toHaveLength(1);

    const [, init] = batchCalls[0] as [string, RequestInit];
    const { requests } = JSON.parse(init.body as string) as {
      requests: unknown[];
    };
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      appendCells: {
        sheetId: 10,
        rows: [
          {
            values: [
              { userEnteredValue: { stringValue: "Alice" } },
              { userEnteredValue: { numberValue: 42 } },
            ],
          },
        ],
      },
    });
    expect(requests[1]).toMatchObject({
      appendCells: {
        sheetId: 20,
        rows: [
          {
            values: [
              { userEnteredValue: { stringValue: "Bob" } },
              { userEnteredValue: { stringValue: "=SUM(A1)" } },
            ],
          },
        ],
      },
    });
  });

  it("looks tab IDs up once across calls", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(metadataResponse());
    // batchUpdate calls can just resolve ok.
    fetchMock.mockImplementation((url: string) =>
      String(url).includes(":batchUpdate")
        ? Promise.resolve(new Response("{}", { status: 200 }))
        : Promise.resolve(metadataResponse())
    );

    await appendLead(ACCOUNT, SHEET, ["Alice"], []);
    await appendLead(ACCOUNT, SHEET, ["Carol"], []);

    const metadataCalls = fetchMock.mock.calls.filter(
      ([url]) => !String(url).includes(":batchUpdate")
    );
    expect(metadataCalls).toHaveLength(1);
  });

  it("throws and forgets the cache when a tab is missing", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      Response.json({
        sheets: [{ properties: { sheetId: 10, title: "Leads" } }],
      })
    );

    await expect(appendLead(ACCOUNT, SHEET, ["Alice"], [])).rejects.toThrow(
      'Sheet tab "Members" not found'
    );

    // Cache was cleared: a retry looks the metadata up again.
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(metadataResponse());
    fetchMock.mockResolvedValueOnce(metadataResponse());
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    await appendLead(ACCOUNT, SHEET, ["Alice"], []);
    expect(
      fetchMock.mock.calls.filter(
        ([url]) => !String(url).includes(":batchUpdate")
      )
    ).toHaveLength(1);
  });

  it("reports only Google's error status", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(metadataResponse()).mockResolvedValueOnce(
      Response.json(
        {
          error: {
            status: "PERMISSION_DENIED",
            message: 'Cannot write "super-secret-cell-value" to sheet',
          },
        },
        { status: 403 }
      )
    );

    const error = await appendLead(ACCOUNT, SHEET, ["Alice"], []).catch(
      (error_: Error) => error_
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Sheets API 403 PERMISSION_DENIED");
    expect((error as Error).message).not.toContain("super-secret-cell-value");
  });
});

describe(ensureTabs, () => {
  beforeEach(() => {
    resetTabCache();
    vi.stubGlobal("fetch", vi.fn());
  });

  it("creates missing tabs and writes header rows", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      // First tabIds() lookup: no tabs exist yet.
      .mockResolvedValueOnce(Response.json({ sheets: [] }))
      // addSheet batchUpdate.
      .mockResolvedValueOnce(new Response("{}", { status: 200 }))
      // tabIds() again, after creation.
      .mockResolvedValueOnce(metadataResponse())
      // column-counts lookup.
      .mockResolvedValueOnce(
        Response.json({
          sheets: [
            {
              properties: {
                title: "Leads",
                gridProperties: { columnCount: 26 },
              },
            },
            {
              properties: {
                title: "Members",
                gridProperties: { columnCount: 26 },
              },
            },
          ],
        })
      )
      // header-writing batchUpdate.
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    const created = await ensureTabs(ACCOUNT, SHEET, {
      Leads: ["First", "Last"],
      Members: ["Name"],
    });

    expect(created.toSorted()).toStrictEqual(["Leads", "Members"]);
  });
});
