import { App } from "aws-cdk-lib";

import { LeadFormStack } from "../lib/lead-form-stack.ts";

const app = new App();

const context = (key: string): string =>
  String(app.node.tryGetContext(key) ?? "");

new LeadFormStack(app, "InsurePortal", {
  // Account comes from the CLI profile used to deploy; nothing is hard-coded until the
  // production account is decided.
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "me-central-1" },
  spreadsheetId: context("spreadsheetId"),
  domainName: context("domainName") || undefined,
  certificateArn: context("certificateArn") || undefined,
  reservedConcurrency: Number(
    app.node.tryGetContext("reservedConcurrency") ?? 5
  ),
});
