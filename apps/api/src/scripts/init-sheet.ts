// One-off setup: creates the Leads and Members tabs (if missing) with bold, frozen header rows.
// Usage: pnpm --filter @insure/api sheet:init   (reads api/.env)
import { LEAD_HEADERS, MEMBER_HEADERS } from "../rows.ts";
import { getSecrets } from "../secrets.ts";
import { SheetsClient, sheetConfigFromEnv } from "../sheets.ts";

const config = sheetConfigFromEnv();
const { googleServiceAccount } = await getSecrets();
const client = new SheetsClient(googleServiceAccount, config);
const created = await client.ensureTabs({
  [config.leadsTab]: LEAD_HEADERS,
  [config.membersTab]: MEMBER_HEADERS,
});
console.info(
  created.length > 0
    ? `Created tabs: ${created.join(", ")}. Headers written.`
    : "Tabs already existed. Headers written."
);
