// Decrypts a `replay` value from a failed-submission log and replays it.
// Usage: pnpm --filter web replay <private-key-file> <replay value> [--append]
//   Lost lead (sheet_write_failed, turnstile_unreachable): prints the rows; --append
//   writes them to the Sheet (reads .dev.vars; pass SPREADSHEET_ID=<prod ID> inline).
//   Rejected submission (lead_rejected): prints the body and why it fails validation.
import { readFileSync } from "node:fs";

import { submissionSchema } from "@insure/shared";
import { z } from "zod";

import { loadConfig } from "../config.ts";
import { importReplayPrivateKey, openReplay } from "../replay.ts";
import type { ReplayPrivateJwk } from "../replay.ts";
import { appendLead } from "../sheets.ts";

const [keyFile, sealed, flag] = process.argv.slice(2);
if (!keyFile || !sealed || (flag !== undefined && flag !== "--append")) {
  console.error(
    "Usage: pnpm --filter web replay <private-key-file> <replay value> [--append]"
  );
  process.exit(1);
}

const privateKey = await importReplayPrivateKey(
  JSON.parse(readFileSync(keyFile, "utf-8")) as ReplayPrivateJwk
);
const payload = await openReplay(privateKey, sealed);

if (payload.kind === "body") {
  console.info(`Received ${payload.receivedAt}:`);
  console.info(JSON.stringify(payload.body, null, 2));
  const result = submissionSchema.safeParse(payload.body);
  console.info(
    result.success
      ? "\nValid today. Date rules are relative to today, so it may have failed only on the day it was sent."
      : `\nInvalid today:\n${z.prettifyError(result.error)}`
  );
} else if (flag === "--append") {
  const config = loadConfig(process.env);
  await appendLead(
    config.googleServiceAccount,
    config.sheet,
    payload.leadRow,
    payload.memberRows
  );
  console.info(
    `Appended lead ${payload.leadId} with ${payload.memberRows.length} member rows to ${config.sheet.spreadsheetId}.`
  );
} else {
  console.info(`Lead ${payload.leadId}:`);
  console.info(JSON.stringify(payload, null, 2));
  console.info("\nRun again with --append to write it to the Sheet.");
}
