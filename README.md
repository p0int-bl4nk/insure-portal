# insure-portal

Health-insurance lead form for Dubai/UAE users. A 5-step wizard (who's covered, contact, one tab per member, health, policy) collects each member's details and minimal pre-existing-condition (PED) data; a Cloudflare Worker validates it (Turnstile → bot checks → Zod → Google Sheets) and appends it to a Google Sheet.

```
apps/
  web/        React 19 + Vite + Tailwind v4 + shadcn (Base UI, Lyra style): the SPA (src/)
              plus the Cloudflare Worker that serves it and handles /api/lead (worker/)
packages/
  shared/     Zod schema, option lists and types used by the SPA and the Worker
```

Tooling: pnpm workspaces with a catalog for shared versions, Turborepo, Ultracite (oxlint + oxfmt), Vitest, Playwright.

## Prerequisites

- Node 24+
- pnpm via Corepack (`corepack enable`, version pinned in `package.json`)

## Local development

No Cloudflare account is needed locally; `pnpm dev` runs the real Worker in `workerd` alongside the SPA, so there's no separate API server or proxy.

1. `pnpm install`
2. Create a **dev** Google Sheet, never the production one, and a Google Cloud service account with the Sheets API enabled. Share the Sheet with the service account's `client_email` as Editor.
3. `cp apps/web/.dev.vars.example apps/web/.dev.vars`, then fill in `GOOGLE_SERVICE_ACCOUNT_JSON`.
4. `cp apps/web/.env.example apps/web/.env`.
5. `SPREADSHEET_ID=<dev-sheet-id> pnpm --filter web sheet:init` creates the `Leads` and `Members` tabs with header rows. The ID is the dev Sheet's own ID; the running Worker instead reads it from `wrangler.jsonc`'s `env.dev` (and `.dev.vars` can override it).
6. `pnpm dev` starts the SPA and Worker together at http://localhost:5173, always against the dev Worker environment (`CLOUDFLARE_ENV=dev`) and the dev Sheet.

> **Careful with `preview`.** `pnpm --filter web preview` serves whichever build ran last. After `pnpm build` that is the **production** config, so a lead submitted locally would be written to the prod Sheet. Run `pnpm --filter web build:dev` before `preview`.

The Turnstile human check is **off by default** locally. To try it, set `TURNSTILE_ENABLED=true` in `apps/web/.dev.vars` and `VITE_TURNSTILE_ENABLED=true` in `apps/web/.env`; Cloudflare's always-pass test keys are already filled in.

## Scripts

Root scripts run the task across every package via Turborepo:

| Command          | What it does                             |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | Web SPA + Worker dev server (`apps/web`) |
| `pnpm build`     | Production build of the web app          |
| `pnpm typecheck` | TypeScript across all packages           |
| `pnpm test`      | Vitest across all packages               |
| `pnpm test:e2e`  | Playwright browser tests of the wizard   |
| `pnpm check`     | Ultracite lint + format check            |
| `pnpm fix`       | Ultracite autofix + format               |

A few scripts only make sense for `apps/web` and are run with `pnpm --filter web <script>`:

| Command | What it does |
| --- | --- |
| `build:dev` | Build with `CLOUDFLARE_ENV=dev`, for deploying the dev Worker |
| `deploy` | `wrangler deploy`, deploying whatever the last build produced |
| `preview` | `vite preview`, serving whichever build ran last |
| `cf-typegen` | Regenerate `worker/worker-configuration.d.ts` from `wrangler.jsonc` |
| `sheet:init` | Create/update the `Leads` and `Members` tabs; needs `SPREADSHEET_ID=<id>` inline |
| `replay:keygen` | Create the key pair that failed submissions are encrypted to (see [Replaying failed submissions](#replaying-failed-submissions)) |
| `replay` | Decrypt a logged failed submission and replay it |

## Tests

- **Vitest** (`pnpm test`) covers the rules: the shared Zod schema (`packages/shared/src/lead.test.ts`), form helpers, and the Worker's handler and config (`apps/web/worker/*.test.ts`). Every combination of category, relation, age and answer belongs here, where it runs in milliseconds.
- **Playwright** (`pnpm test:e2e`, specs in `apps/web/e2e/*.e2e.ts`) drives the real wizard in Chromium: one full journey per category, each step's conditional fields and validation, moving between steps and member tabs, and every submit outcome. `/api/lead` is mocked with `page.route`, so the Worker and Google Sheet are never touched, and Turnstile is switched off. The full journeys (tagged `@journey`) also run at phone size.

First run: `pnpm --filter web exec playwright install chromium`. Failed tests keep a trace in `apps/web/test-results/`; open it with `pnpm --filter web exec playwright show-trace <path>`.

## Deploying

The app runs as two Cloudflare Workers, built from `apps/web/wrangler.jsonc`: the production Worker `insure-portal`, and the dev Worker `insure-portal-dev` (`env.dev`). Which one a build targets is chosen at **build time** with `CLOUDFLARE_ENV`, not with `wrangler deploy --env` — the Cloudflare Vite plugin writes a redirected deploy config into `dist/`, and `wrangler deploy` just deploys whatever the last build produced.

1. Create the Cloudflare account and turn on 2FA. Choose a `workers.dev` subdomain.
2. `pnpm --filter web exec wrangler login`.
3. Create the **prod** Google Sheet and a prod service account with the Sheets API enabled, share the Sheet with its `client_email` as Editor, and create the tabs. Variables already set in the shell win over `.dev.vars`, so this uses the prod key, not the dev one:
   ```sh
   SPREADSHEET_ID=<prod-sheet-id> GOOGLE_SERVICE_ACCOUNT_JSON="$(cat prod-sa.json)" pnpm --filter web sheet:init
   ```
4. Replace `REPLACE_WITH_PROD_SHEET_ID` in `apps/web/wrangler.jsonc`'s top-level `vars.SPREADSHEET_ID` with the prod Sheet ID, then run `pnpm --filter web cf-typegen` and commit both files. Do this before any prod build or deploy.
5. Create the Turnstile widget for the hostname `insure-portal.<sub>.workers.dev` and keep its site and secret keys. The dev Worker doesn't need one: it uses Cloudflare's always-pass test keys.
6. Create the Google Chat space and its incoming webhook URL. On `sheet_write_failed` or `turnstile_unreachable`, the prod Worker posts the event and lead ID there. All logs go to Workers Logs.
   Then create the replay key pair (`pnpm --filter web replay:keygen`), store the private key file somewhere safe outside the repo, and set the printed public key as `REPLAY_PUBLIC_KEY` in both `vars` blocks of `apps/web/wrangler.jsonc`. It's public, so it isn't a secret.
7. Do the first deploy, to create both Workers. Builds read `VITE_*` from `apps/web/.env`, which has Turnstile off for local work, so pass them inline:
   ```sh
   VITE_TURNSTILE_ENABLED=true VITE_TURNSTILE_SITE_KEY=<real site key> pnpm --filter web build && pnpm --filter web deploy
   VITE_TURNSTILE_ENABLED=true VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA pnpm --filter web build:dev && pnpm --filter web deploy
   ```
8. Set the secrets for each Worker. Until they're set, `/api/lead` returns 503 and logs `config_invalid`.
   ```sh
   pnpm --filter web exec wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON   # prod service account
   pnpm --filter web exec wrangler secret put TURNSTILE_SECRET_KEY          # real secret key (step 5)
   pnpm --filter web exec wrangler secret put ALERT_WEBHOOK_URL             # Chat webhook (step 6), prod only
   ```
   Repeat the first two with `--name insure-portal-dev` for the dev Worker, using the dev service account and the always-pass secret `1x0000000000000000000000000000000AA`. Use `--name`, not `--env dev`: `--name` works whichever build ran last.
9. Workers Builds, **prod connection**:
   - repo `p0int-bl4nk/insure-portal`, root directory `apps/web`, production branch `main`
   - **turn off non-production branch builds**, so only `main` ever builds against the prod Worker
   - build command: `pnpm install --frozen-lockfile && pnpm -w check && pnpm -w typecheck && pnpm -w test && pnpm build`
   - deploy command: `pnpm exec wrangler deploy`
   - build variables (build-time only, not runtime): `VITE_TURNSTILE_ENABLED=true`, `VITE_TURNSTILE_SITE_KEY=<real site key>`
10. Workers Builds, **dev connection**:
    - same repo and root directory, production branch `development`, non-production branch builds **on**
    - build command: as above, but ending in `pnpm build:dev`
    - deploy command (for `development`): `pnpm exec wrangler deploy`
    - non-production branch deploy command: leave the default `pnpm exec wrangler versions upload`, so PR branches get preview URLs without replacing the live dev Worker
    - build variables: `VITE_TURNSTILE_ENABLED=true`, `VITE_TURNSTILE_SITE_KEY=1x00000000000000000000AA`
11. Trigger one build on each connection (push, or **Retry build** in the dashboard), so the live SPAs come from CI rather than the laptop builds in step 7.
12. To roll back a Worker: `pnpm --filter web exec wrangler rollback`, or add `--name insure-portal-dev` for the dev Worker.

Preview URLs are off for the prod Worker (`"preview_urls": false` in `wrangler.jsonc`) and on for the dev Worker.

Node and pnpm versions: Workers Builds reads `.node-version` (this repo pins Node 24, which is already one of its preinstalled versions) and the `packageManager` field in `package.json` (pinned to `pnpm@12.21.0`) automatically, ahead of its defaults — no `NODE_VERSION` or `PNPM_VERSION` build variable is needed. ([build image docs](https://developers.cloudflare.com/workers/ci-cd/builds/build-image/))

Secrets locally live in `apps/web/.dev.vars` (gitignored; template `apps/web/.dev.vars.example`). The Vite plugin copies `.dev.vars` into `dist/` on build for local `wrangler dev`/`preview` use — that copy is itself gitignored and is never part of what gets deployed.

## Replaying failed submissions

When `REPLAY_PUBLIC_KEY` is set, these log events carry a `replay` field: the failed submission, encrypted to that key (RSA-OAEP wrapping an AES-256-GCM key). Without the private key the field is unreadable, so Workers Logs still hold no readable personal data.

- `sheet_write_failed` and `turnstile_unreachable`: a valid lead that was never saved. `replay` holds the exact Sheet rows.
- `lead_rejected` with reason `invalid`: `replay` holds the request body as received, minus the Turnstile token.

Copy the `replay` value from the log, then:

```sh
pnpm --filter web replay <private-key-file> '<replay value>'            # print it
SPREADSHEET_ID=<prod-sheet-id> GOOGLE_SERVICE_ACCOUNT_JSON="$(cat prod-sa.json)" \
  pnpm --filter web replay <private-key-file> '<replay value>' --append  # lost lead: write it to the Sheet
```

For a rejected body it prints the body and every reason it fails validation. Date rules use today's date, so a body sent near a boundary may validate differently now. The decrypted output is personal and health data: don't paste it into tickets or chats.

## Sheet layout

- **Leads**: one row per submission: reference and timestamp; category (Self Only, Both Self and Family, Family without Self); contact name, mobile and email; sponsor name, nationality and Emirates ID (Family without Self only); member summary (`member_count`, `any_ped`, `any_smoker`, `any_pregnant`, `max_age`); policy start date, previous policy expiry, income range, occupation; `consent_version`. The column list lives in `LEAD_COLUMNS` in `apps/web/worker/rows.ts`.
- **Members**: one row per insured member, linked by `lead_id`: relation; first, middle and last name; date of birth and age; gender; marital status; nationality; visa emirate, visa file number, passport number; Emirates ID and expiry, or e-visa UID; height and weight; conditions, smoker, pregnant. The column list lives in `MEMBER_COLUMNS`.

`sheet:init` writes both header rows from these lists. After changing the columns, run it again and clear any rows written under the old headers.

Both rows are written in a single atomic `batchUpdate`. Cells are written as literals, so a value like `=SUM()` can never run as a formula.

## Open items before launch

- **Compliance sign-off:** PED (health) data, height/weight and identity documents (Emirates ID, passport and visa numbers) are stored in Google Sheets, outside the UAE. See UAE Federal Law No. 2 of 2019 and the PDPL. This blocks launch.
- Confirm the placeholder income ranges and occupations in `packages/shared/src/options.ts`. The first income band must stay at AED 4,000 (Essential Benefits Plan threshold).
- Legal review of the declaration (`DECLARATION` in `packages/shared/src/options.ts`), including the "Insurance Co" placeholder. Bump `CONSENT_VERSION` whenever the text changes.
- Data retention: rows are currently kept indefinitely (accepted risk).
- The production Sheet ID (`wrangler.jsonc`'s `REPLACE_WITH_PROD_SHEET_ID`) and the real Turnstile site/secret keys.
- Buy the domain; once its DNS moves to Cloudflare, add WAF managed rules and a rate-limit rule on `/api/lead`.
