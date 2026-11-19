import { JWT } from "google-auth-library";
import { z } from "zod";

import type { Cell } from "./rows.ts";
import type { ServiceAccount } from "./secrets.ts";

const API = "https://sheets.googleapis.com/v4/spreadsheets";
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

const SHEET_URL = /\/spreadsheets\/d\/(?<id>[\w-]+)/u;
const SHEET_ID = /^[\w-]{20,}$/u;

const sheetEnvSchema = z
  .object({
    // Accepts the bare ID or a pasted Sheet URL (…/spreadsheets/d/<id>/edit…).
    SPREADSHEET_ID: z
      .string()
      .trim()
      .min(1, "SPREADSHEET_ID is not set")
      .transform((value) => value.match(SHEET_URL)?.groups?.id ?? value)
      .pipe(
        z
          .string()
          .regex(SHEET_ID, "SPREADSHEET_ID must be the Sheet ID from its URL")
      ),
    SHEET_LEADS_TAB: z.string().min(1).default("Leads"),
    SHEET_MEMBERS_TAB: z.string().min(1).default("Members"),
  })
  .transform((env) => ({
    spreadsheetId: env.SPREADSHEET_ID,
    leadsTab: env.SHEET_LEADS_TAB,
    membersTab: env.SHEET_MEMBERS_TAB,
  }));

export type SheetConfig = z.output<typeof sheetEnvSchema>;

export const sheetConfigFromEnv = (
  env: Record<string, string | undefined> = process.env
): SheetConfig => sheetEnvSchema.parse(env);

/** The part of the spreadsheet metadata response we read. */
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
  );

/**
 * Google's error type, e.g. "INVALID_ARGUMENT" or "PERMISSION_DENIED". Only the
 * status code is kept: the message text can echo submitted cell values.
 */
const googleErrorSchema = z
  .object({ error: z.object({ status: z.string() }) })
  .transform(({ error }) => error.status)
  .catch("UNKNOWN");

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

export class SheetsClient {
  readonly #auth: JWT;
  readonly #config: SheetConfig;
  #tabIds: Promise<Map<string, number>> | undefined;

  constructor(account: ServiceAccount, config: SheetConfig) {
    this.#auth = new JWT({
      email: account.client_email,
      key: account.private_key,
      scopes: SCOPES,
    });
    this.#config = config;
  }

  async #request<T extends z.ZodType>(
    path: string,
    response: T,
    init: RequestInit = {}
  ): Promise<z.output<T>> {
    const { token } = await this.#auth.getAccessToken();
    const res = await fetch(`${API}/${this.#config.spreadsheetId}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const reason = googleErrorSchema.parse(
        await res.json().catch(() => null)
      );
      throw new Error(`Sheets API ${res.status} ${reason}`);
    }
    return response.parse(await res.json());
  }

  /** Numeric tab IDs (needed by appendCells), looked up once per instance. */
  tabIds(): Promise<Map<string, number>> {
    if (!this.#tabIds) {
      this.#tabIds = this.#request(
        "?fields=sheets.properties(sheetId,title)",
        tabsSchema
      );
      this.#tabIds.catch(() => {
        this.#tabIds = undefined;
      });
    }
    return this.#tabIds;
  }

  async #tabId(title: string): Promise<number> {
    const ids = await this.tabIds();
    const id = ids.get(title);
    if (id === undefined) {
      // Look the tabs up again next time, in case someone adds the tab meanwhile.
      this.#tabIds = undefined;
      throw new Error(`Sheet tab "${title}" not found`);
    }
    return id;
  }

  /**
   * Appends the lead row and its member rows in ONE batchUpdate. Google applies a
   * batchUpdate atomically, so a lead is never written without its members.
   * Values are written as string/number literals, never as formulas.
   */
  async appendLead(leadRow: Cell[], memberRows: Cell[][]): Promise<void> {
    const [leadsId, membersId] = await Promise.all([
      this.#tabId(this.#config.leadsTab),
      this.#tabId(this.#config.membersTab),
    ]);
    await this.#request(":batchUpdate", z.unknown(), {
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
  }

  /** Creates missing tabs and writes header rows. Used by the setup script only. */
  async ensureTabs(
    headers: Record<string, readonly string[]>
  ): Promise<string[]> {
    const existing = await this.tabIds();
    const missing = Object.keys(headers).filter(
      (title) => !existing.has(title)
    );
    if (missing.length > 0) {
      await this.#request(":batchUpdate", z.unknown(), {
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
      this.#tabIds = undefined;
    }
    const ids = await this.tabIds();
    // Tabs created earlier (or by hand) may be narrower than the header row.
    const columnCounts = await this.#request(
      "?fields=sheets.properties(title,gridProperties.columnCount)",
      columnCountsSchema
    );
    await this.#request(":batchUpdate", z.unknown(), {
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
  }
}
