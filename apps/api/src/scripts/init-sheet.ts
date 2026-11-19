import { getConfig } from "../config.ts";
// One-off setup: creates the Leads and Members tabs (if missing) with bold, frozen header rows.
// Usage: pnpm --filter @insure/api sheet:init   (reads api/.env)
import { LEAD_HEADERS, MEMBER_HEADERS } from "../rows.ts";
import { SheetsClient } from "../sheets.ts";

const config = await getConfig();
const client = new SheetsClient(config.googleServiceAccount, config.sheet);
const created = await client.ensureTabs({
  [config.sheet.leadsTab]: LEAD_HEADERS,
  [config.sheet.membersTab]: MEMBER_HEADERS,
});
console.info(
  created.length > 0
    ? `Created tabs: ${created.join(", ")}. Headers written.`
    : "Tabs already existed. Headers written."
);
