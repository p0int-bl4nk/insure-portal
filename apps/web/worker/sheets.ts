import { z } from "zod";

import type { ServiceAccount, SheetConfig } from "./config.ts";
import { getAccessToken } from "./google-token.ts";
import type { Cell } from "./rows.ts";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

const tabsSchema = z
  .object({
    sheets: z.array(
      z.object({
        properties: z.object({ sheetId: z.number(), title: z.string() }),
      })
    ),
  })
  .transform(
    ({ sheets }) =>
      new Map(sheets.map((s) => [s.properties.title, s.properties.sheetId]))
  )
  .describe("The part of the spreadsheet metadata response we read.");

const googleErrorSchema = z
  .object({ error: z.object({ status: z.string() }) })
  .transform(({ error }) => error.status)
  .catch("UNKNOWN")
  .describe(
    'Google\'s error type, e.g. "PERMISSION_DENIED". Only the status is kept: the message can echo submitted cell values.'
  );

/** New tabs get Google's default 26 columns (A–Z) unless asked for more. */
const DEFAULT_COLUMN_COUNT = 26;

const columnCountsSchema = z
  .object({
    sheets: z.array(
      z.object({
        properties: z.object({
          title: z.string(),
          gridProperties: z.object({ columnCount: z.number() }),
        }),
      })
    ),
  })
  .transform(
    ({ sheets }) =>
      new Map(
        sheets.map((s) => [
          s.properties.title,
          s.properties.gridProperties.columnCount,
        ])
      )
  );

/** An appendDimension request when a tab has fewer columns than needed. */
const widen = (
  sheetId: number | undefined,
  columnCount: number | undefined,
  needed: number
) =>
  sheetId !== undefined && columnCount !== undefined && columnCount < needed
    ? [
        {
          appendDimension: {
            sheetId,
            dimension: "COLUMNS",
            length: needed - columnCount,
          },
        },
      ]
    : [];

/** Literal cell values only: strings are never parsed as formulas. */
const toRow = (cells: Cell[]) => ({
  values: cells.map((cell) => ({
    userEnteredValue:
      typeof cell === "number" ? { numberValue: cell } : { stringValue: cell },
  })),
});

/** Numeric tab IDs (needed by appendCells), looked up once per spreadsheet and
 * shared across calls. */
const tabIdCache = new Map<string, Promise<Map<string, number>>>();

/** Only for tests: forgets every cached tab-ID lookup. */
export const resetTabCache = (): void => {
  tabIdCache.clear();
};

const request = async <T extends z.ZodType>(
  account: ServiceAccount,
  sheet: SheetConfig,
  path: string,
  response: T,
  init: RequestInit = {}
): Promise<z.output<T>> => {
  const token = await getAccessToken(account);
  const res = await fetch(`${API}/${sheet.spreadsheetId}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    const reason = googleErrorSchema.parse(await res.json().catch(() => null));
    throw new Error(`Sheets API ${res.status} ${reason}`);
  }
  return response.parse(await res.json());
};

const tabIds = (
  account: ServiceAccount,
  sheet: SheetConfig
): Promise<Map<string, number>> => {
  let ids = tabIdCache.get(sheet.spreadsheetId);
  if (!ids) {
    ids = request(
      account,
      sheet,
      "?fields=sheets.properties(sheetId,title)",
      tabsSchema
    );
    tabIdCache.set(sheet.spreadsheetId, ids);
    ids.catch(() => {
      tabIdCache.delete(sheet.spreadsheetId);
    });
  }
  return ids;
};

const tabId = async (
  account: ServiceAccount,
  sheet: SheetConfig,
  title: string
): Promise<number> => {
  const ids = await tabIds(account, sheet);
  const id = ids.get(title);
  if (id === undefined) {
    // Look the tabs up again next time, in case someone adds the tab meanwhile.
    tabIdCache.delete(sheet.spreadsheetId);
    throw new Error(`Sheet tab "${title}" not found`);
  }
  return id;
};

/**
 * Appends the lead row and its member rows in ONE batchUpdate. Google applies a
 * batchUpdate atomically, so a lead is never written without its members.
 * Values are written as string/number literals, never as formulas.
 */
export const appendLead = async (
  account: ServiceAccount,
  sheet: SheetConfig,
  leadRow: Cell[],
  memberRows: Cell[][]
): Promise<void> => {
  const [leadsId, membersId] = await Promise.all([
    tabId(account, sheet, sheet.leadsTab),
    tabId(account, sheet, sheet.membersTab),
  ]);
  await request(account, sheet, ":batchUpdate", z.unknown(), {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          appendCells: {
            sheetId: leadsId,
            rows: [toRow(leadRow)],
            fields: "userEnteredValue",
          },
        },
        {
          appendCells: {
            sheetId: membersId,
            rows: memberRows.map(toRow),
            fields: "userEnteredValue",
          },
        },
      ],
    }),
  });
};

/** Creates missing tabs and writes header rows. Used by the setup script only. */
export const ensureTabs = async (
  account: ServiceAccount,
  sheet: SheetConfig,
  headers: Record<string, readonly string[]>
): Promise<string[]> => {
  const existing = await tabIds(account, sheet);
  const missing = Object.keys(headers).filter((title) => !existing.has(title));
  if (missing.length > 0) {
    await request(account, sheet, ":batchUpdate", z.unknown(), {
      method: "POST",
      body: JSON.stringify({
        requests: missing.map((title) => ({
          addSheet: {
            properties: {
              title,
              gridProperties: {
                columnCount: Math.max(
                  DEFAULT_COLUMN_COUNT,
                  headers[title]?.length ?? 0
                ),
              },
            },
          },
        })),
      }),
    });
    tabIdCache.delete(sheet.spreadsheetId);
  }
  const ids = await tabIds(account, sheet);
  // Tabs created earlier (or by hand) may be narrower than the header row.
  const columnCounts = await request(
    account,
    sheet,
    "?fields=sheets.properties(title,gridProperties.columnCount)",
    columnCountsSchema
  );
  await request(account, sheet, ":batchUpdate", z.unknown(), {
    method: "POST",
    body: JSON.stringify({
      requests: Object.entries(headers).flatMap(([title, row]) => [
        ...widen(ids.get(title), columnCounts.get(title), row.length),
        {
          updateCells: {
            start: { sheetId: ids.get(title), rowIndex: 0, columnIndex: 0 },
            rows: [
              {
                values: row.map((h) => ({
                  userEnteredValue: { stringValue: h },
                  userEnteredFormat: { textFormat: { bold: true } },
                })),
              },
            ],
            fields: "userEnteredValue,userEnteredFormat.textFormat.bold",
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId: ids.get(title),
              gridProperties: { frozenRowCount: 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
      ]),
    }),
  });
  return missing;
};
