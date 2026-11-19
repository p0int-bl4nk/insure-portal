# insure-portal

Health-insurance lead form for Dubai/UAE users. A 5-step wizard (who's covered, contact, one tab per member, health, policy) collects each member's details and minimal pre-existing-condition (PED) data; a Lambda validates it and appends it to a Google Sheet.

```
apps/
  web/        React 19 + Vite + Tailwind v4 + shadcn (Base UI, Lyra style)
  api/        Lambda handler (Turnstile → bot checks → Zod → Google Sheets) + local dev server
packages/
  shared/     Zod schema, option lists and types used by web and api
infra/        Terraform (CloudFront + S3, HTTP API, Lambda, Secrets Manager, alarms)
scripts/      deploy-web.sh: upload the built site and invalidate CloudFront
```

Tooling: pnpm workspaces with a catalog for shared versions, Turborepo, Ultracite (oxlint + oxfmt), Vitest.

## Prerequisites

- Node 24+
- pnpm via Corepack (`corepack enable`, version pinned in `package.json`)

## Local development

No AWS credentials are needed locally.

1. `pnpm install`
2. Create a **dev** Google Sheet, never the production one, and a Google Cloud service account with the Sheets API enabled. Share the Sheet with the service account's `client_email` as Editor.
3. `cp apps/api/.env.example apps/api/.env`, then fill in `SPREADSHEET_ID` and `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. `cp apps/web/.env.example apps/web/.env`.
5. `pnpm --filter @insure/api sheet:init` creates the `Leads` and `Members` tabs with header rows.
6. `pnpm dev` starts the web app at http://localhost:5173 and the API at :8787. Vite proxies `/api` to the API.

The Turnstile human check is **off by default**. To try it locally, set `TURNSTILE_ENABLED=true` in `apps/api/.env` and `VITE_TURNSTILE_ENABLED=true` in `apps/web/.env`; Cloudflare's always-pass test keys are already filled in.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Web and API dev servers |
| `pnpm build` | Production build of the web app |
| `pnpm typecheck` | TypeScript across all packages |
| `pnpm test` | Vitest across all packages |
| `pnpm check` | Ultracite lint + format check |
| `pnpm fix` | Ultracite autofix + format |
| `pnpm deploy:web` | Build the web app, upload it to S3, invalidate CloudFront |

## Deploying (account not decided yet)

Needs Terraform ≥ 1.17 and the AWS CLI, signed in to the target account.

1. `cp infra/terraform.tfvars.example infra/terraform.tfvars` and set `spreadsheet_id` (optionally `domain_name` + a us-east-1 `certificate_arn`).
2. Build the Lambda bundle: `pnpm --filter @insure/api build` (Terraform zips `apps/api/dist`).
3. `terraform -chdir=infra init`, then `terraform -chdir=infra apply`. Everything is in `me-central-1` except CloudFront, which is global.
4. Put the real secret value into the `app_secret_arn` output, outside Terraform so it never lands in state:
   ```sh
   aws secretsmanager put-secret-value --secret-id "$(terraform -chdir=infra output -raw app_secret_arn)" \
     --secret-string file://secret.json
   ```
   where `secret.json` is
   ```json
   {
     "googleServiceAccount": { "client_email": "…", "private_key": "…" },
     "turnstileSecretKey": "…"
   }
   ```
5. Turn Turnstile on for production: `VITE_TURNSTILE_ENABLED=true` plus the real site key in `apps/web/.env`, and `TURNSTILE_ENABLED=true` in the Lambda environment. Then `pnpm deploy:web`.

Terraform state is local until the account is chosen; `infra/versions.tf` has the S3 backend block to switch to. Lambda reserved concurrency defaults to 5 (`reserved_concurrency`). Accounts with a low concurrency quota may need to raise the quota or lower this value.

## Sheet layout

- **Leads**: one row per submission: reference and timestamp; category (Self Only, Both Self and Family, Family without Self); contact name, mobile and email; sponsor name, nationality and Emirates ID (Family without Self only); member summary (`member_count`, `any_ped`, `any_smoker`, `any_pregnant`, `max_age`); policy start date, previous policy expiry, income range, occupation; `consent_version`. The column list lives in `LEAD_COLUMNS` in `apps/api/src/rows.ts`.
- **Members**: one row per insured member, linked by `lead_id`: relation; first, middle and last name; date of birth and age; gender; marital status; nationality; visa emirate, visa file number, passport number; Emirates ID and expiry, or e-visa UID; height and weight; conditions, smoker, pregnant. The column list lives in `MEMBER_COLUMNS`.

`sheet:init` writes both header rows from these lists. After changing the columns, run it again and clear any rows written under the old headers.

Both rows are written in a single atomic `batchUpdate`. Cells are written as literals, so a value like `=SUM()` can never run as a formula.

## Open items before launch

- **Compliance sign-off:** PED (health) data, height/weight and identity documents (Emirates ID, passport and visa numbers) are stored in Google Sheets, outside the UAE. See UAE Federal Law No. 2 of 2019 and the PDPL. This blocks launch.
- Confirm the placeholder income ranges and occupations in `packages/shared/src/options.ts`. The first income band must stay at AED 4,000 (Essential Benefits Plan threshold).
- Legal review of the declaration (`DECLARATION` in `packages/shared/src/options.ts`), including the "Insurance Co" placeholder. Bump `CONSENT_VERSION` whenever the text changes.
- Real logo (placeholder in `apps/web/src/features/lead/wizard-layout.tsx`).
- Production AWS account, domain, and Turnstile site/secret keys.
- Data retention: rows are currently kept indefinitely (accepted risk).
