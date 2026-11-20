import { loadConfig } from "../config.ts";
// One-off setup: creates the Leads and Members tabs (if missing) with bold, frozen header rows.
// Usage: pnpm --filter web sheet:init   (reads .dev.vars; pass SPREADSHEET_ID=<dev or prod ID> inline)
import { LEAD_HEADERS, MEMBER_HEADERS } from "../rows.ts";
import { ensureTabs } from "../sheets.ts";

const config = loadConfig(process.env);
const created = await ensureTabs(config.googleServiceAccount, config.sheet, {
  [config.sheet.leadsTab]: LEAD_HEADERS,
  [config.sheet.membersTab]: MEMBER_HEADERS,
});
console.info(
  created.length > 0
    ? `Created tabs: ${created.join(", ")}. Headers written.`
    : "Tabs already existed. Headers written."
);
