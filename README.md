# insure-portal

Health-insurance lead form for Dubai/UAE users. A 3-step wizard collects basic details and minimal pre-existing-condition (PED) data; a Lambda validates it and appends it to a Google Sheet.

```
apps/
  web/        React 19 + Vite + Tailwind v4 + shadcn (Base UI, Lyra style)
  api/        Lambda handler (Turnstile → bot checks → Zod → Google Sheets) + local dev server
packages/
  shared/     Zod schema, option lists and types used by web and api
  infra/      AWS CDK stack (CloudFront + S3, HTTP API, Lambda, Secrets Manager, alarms)
```

Tooling: pnpm workspaces with a catalog for shared versions, Turborepo, Ultracite (oxlint + oxfmt), Vitest.

## Prerequisites

- Node 24+
- pnpm via Corepack (`corepack enable`, version pinned in `package.json`)

## Local development

No AWS credentials are needed locally.

1. `pnpm install`
2. Create a **dev** Google Sheet, never the production one, and a Google Cloud service account with the Sheets API enabled. Share the Sheet with the service account's `client_email` as Editor.
3. `cp apps/api/.env.example apps/api/.env`, then fill in `SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON`. The Turnstile test secret is already set.
4. `cp apps/web/.env.example apps/web/.env`. It contains Turnstile's always-pass test site key.
5. `pnpm --filter @insure/api sheet:init` creates the `Leads` and `Members` tabs with header rows.
6. `pnpm dev` starts the web app at http://localhost:5173 and the API at :8787. Vite proxies `/api` to the API.

## Scripts

| Command          | What it does                                      |
| ---------------- | ------------------------------------------------- |
| `pnpm dev`       | Web and API dev servers                           |
| `pnpm build`     | Production build of the web app                   |
| `pnpm typecheck` | TypeScript across all packages                    |
| `pnpm test`      | Vitest across all packages                        |
| `pnpm check`     | Ultracite lint + format check                     |
| `pnpm fix`       | Ultracite autofix + format                        |
| `pnpm synth`     | Build web, then `cdk synth` (no AWS calls needed) |

## Deploying (account not decided yet)

1. Set `spreadsheetId` (and optionally `domainName` + a us-east-1 `certificateArn`) in `packages/infra/cdk.json`.
2. `pnpm --filter @insure/infra exec cdk bootstrap` (once per account/region, `me-central-1`).
3. `pnpm build && pnpm --filter @insure/infra deploy`
4. Put the real secret value into the `AppSecretArn` output:
   ```json
   {
     "googleServiceAccount": { "client_email": "…", "private_key": "…" },
     "turnstileSecretKey": "…"
   }
   ```
5. Set the production Turnstile site key in `apps/web/.env` before building.

Lambda reserved concurrency defaults to 5 (`reservedConcurrency` context). Accounts with a low concurrency quota may need to raise the quota or lower this value.

## Sheet layout

- **Leads**: one row per submission: `lead_id`, `reference`, `submitted_at_gst`, proposer details, `member_count`, `any_ped`, `any_smoker`, `any_pregnant`, `max_age`, `consent_version`.
- **Members**: one row per insured member, linked by `lead_id`.

Both rows are written in a single atomic `batchUpdate`. Cells are written as literals, so a value like `=SUM()` can never run as a formula.

## Open items before launch

- **Compliance sign-off:** PED (health) data is stored in Google Sheets, outside the UAE. See UAE Federal Law No. 2 of 2019 and the PDPL. This blocks launch.
- Final consent wording from legal. Bump `CONSENT_VERSION` in `packages/shared/src/options.ts` when it changes.
- Real logo (placeholder in `apps/web/src/features/lead/step-header.tsx`) and privacy-notice link.
- Production AWS account, domain, and Turnstile site/secret keys.
- Data retention: rows are currently kept indefinitely (accepted risk).
