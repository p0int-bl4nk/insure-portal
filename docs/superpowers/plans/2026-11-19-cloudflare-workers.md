# Cloudflare Workers Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move insure-portal from AWS to a single Cloudflare Worker per environment, serving both the SPA and `POST /api/lead`, with no loss of behaviour or safety.

**Architecture:** The API code moves from `apps/api/src` into `apps/web/worker/`. The handler becomes a web-standard `Request → Response` function. `@cloudflare/vite-plugin` builds and runs the SPA and the Worker together, and `wrangler.jsonc` defines a prod Worker plus an `env.dev` Worker. Google auth is reimplemented with WebCrypto, and all AWS pieces are deleted.

**Tech Stack:**

- Cloudflare Workers (static assets + fetch handler)
- `wrangler` and `@cloudflare/vite-plugin`
- Vite 8, React 19
- Zod 4
- Vitest 5
- pnpm 12 with catalog
- Turborepo

**Spec:** `docs/superpowers/specs/2026-11-19-cloudflare-workers-deployment.md`

## Global Constraints

- Work on the `development` branch, and commit after every task.
- Pin exact latest versions. Add `wrangler` and `@cloudflare/vite-plugin` to `apps/web` devDependencies. Use the pnpm catalog only for packages that more than one workspace uses.
- Worker code must use no Node APIs (`node:*`, `Buffer`, `process`), so no `nodejs_compat` flag is needed. Use `crypto.randomUUID()`, `crypto.subtle`, `TextEncoder`, `Request`, `Response` and `fetch` instead.
- Browser code (`apps/web/src`) must not be able to import `apps/web/worker`. The two have separate tsconfigs.
- Logs and alerts carry identifiers, outcomes and error codes only, never field values.
- The body cap stays at `MAX_BODY_BYTES = 16 * 1024` and the minimum fill time at `MIN_FILL_MS = 3000`. Timeouts stay at 8000 ms for Sheets and 5000 ms for Turnstile.
- Run `pnpm check`, `pnpm typecheck` and `pnpm test` from the repo root before every commit. All three must pass.
- Follow the existing style: Zod schemas with `.describe()`, dependency injection through `Deps`, `describe(fn, …)` test blocks, and comment density matching the current files.

## Review Focus

1. **A lying or missing `Content-Length`** (chunked request, header absent, or understating the size). The real body size must still be enforced, giving 413 with no write. _Test: Task 4, "rejects bodies over 16 KB even without Content-Length"._
2. **An expired cached Google token mid-life.** A token is reused while valid and re-minted shortly before it expires. A failed mint must not be cached. _Tests: Task 3, "re-mints a token 5 minutes before expiry" and "does not cache a failed token request"._
3. **The Google Chat webhook is down or slow.** The user still gets the normal 503 or 200 and the post never throws. _Test: Task 4, "never throws when the webhook fails"._
4. **A broken config in production** (missing secret, bad Sheet ID). The user gets `503 {ok:false,error:"unavailable"}` with a `config_invalid` log entry, never a Cloudflare 1101 error page. _Test: Task 5, "returns 503 when the config is invalid"._
5. **The dev Worker writing to the prod Sheet.** `env.dev.vars.SPREADSHEET_ID` must differ from the top-level value, and dev has no `ALERT_WEBHOOK_URL`. _Check: Task 5, step "verify env separation"._

---

## File structure (after)

```
apps/web/
  src/                         SPA (unchanged except: drop dev proxy reliance)
  worker/
    index.ts                   fetch entry: /api/lead → handler, else env.ASSETS
    handler.ts  handler.test.ts
    config.ts   config.test.ts
    google-token.ts google-token.test.ts   (new: WebCrypto JWT + token cache)
    sheets.ts   sheets.test.ts             (functions, tab-ID cache)
    alert.ts    alert.test.ts              (new: Google Chat post)
    rows.ts  turnstile.ts  log.ts  utils.ts
    scripts/init-sheet.ts
  public/_headers              security + cache headers for assets
  wrangler.jsonc  .dev.vars.example  worker-configuration.d.ts (generated)
  tsconfig.worker.json  vitest.config.ts
.node-version                  24
```

Deleted: `apps/api/`, `infra/`, `scripts/deploy-web.sh`.

---

### Task 1: Move `apps/api` into `apps/web/worker` (no behaviour change)

**Files:**

- Move: `apps/api/src/*` → `apps/web/worker/` (with `git mv`, to keep history)
- Create: `apps/web/tsconfig.worker.json`, `apps/web/vitest.config.ts`
- Modify: `apps/web/tsconfig.json` (add the reference), `apps/web/package.json` (merge the dependencies and the `sheet:init` script), `pnpm-lock.yaml`
- Delete: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/dist`

**Interfaces:**

- Produces: worker sources under `apps/web/worker/`, with the same exports as before. Tests run from `pnpm --filter web test`.

- [ ] **Step 1:** `git mv apps/api/src apps/web/worker`, then remove the rest of `apps/api`. Move the API's runtime dependencies (`zod` and `@insure/shared` are already there; add `google-auth-library` and `@aws-sdk/client-secrets-manager` for now) and its devDependencies (`@types/aws-lambda`, `tsx`, `esbuild`) into `apps/web/package.json`. Tasks 3 to 6 remove them again. Run `pnpm install`.
- [ ] **Step 2:** Create `tsconfig.worker.json`:
  - extends `../../tsconfig.base.json`
  - `include: ["worker"]`
  - `lib: ["ES2024"]`, with no DOM
  - `types: ["node"]` for now; Task 5 switches this to the generated Worker types
  - `allowImportingTsExtensions: true`
  - its own `tsBuildInfoFile`

  Add it to `references` in `apps/web/tsconfig.json`. `tsconfig.app.json` keeps `include: ["src"]`, so `src` can't resolve `../worker`.

- [ ] **Step 3:** Create `vitest.config.ts`, kept separate from `vite.config.ts` so the Cloudflare plugin added in Task 5 never loads under Vitest. It has the `@` alias, `include: ["src/**/*.test.{ts,tsx}", "worker/**/*.test.ts"]` and `environment: "node"`.
- [ ] **Step 4:** Run `pnpm typecheck && pnpm test`. All existing tests should pass, including 13 in `handler.test.ts` and 7 in `config.test.ts`.
- [ ] **Step 5:** Run `pnpm check`, then commit with `refactor: move api into apps/web/worker`.

---

### Task 2: Synchronous `loadConfig(env)` with no Secrets Manager

**Files:**

- Modify: `apps/web/worker/config.ts`, `apps/web/worker/config.test.ts`
- Remove: the `@aws-sdk/client-secrets-manager` dependency

**Interfaces:**

- Produces:
  ```ts
  export type RawEnv = Record<string, unknown>;          // the Worker env (strings + bindings)
  export const loadConfig: (env: RawEnv) => Config;      // throws Error("Invalid environment:\n…")
  export type Config = {
    sheet: SheetConfig;                                   // { spreadsheetId, leadsTab, membersTab }
    googleServiceAccount: ServiceAccount;                 // { client_email, private_key }
    turnstile: { enabled: true; secretKey: string } | { enabled: false };
    alertWebhookUrl: string | undefined;
  };
  ```
- Env keys:
  - `SPREADSHEET_ID`
  - `SHEET_LEADS_TAB` (default `Leads`)
  - `SHEET_MEMBERS_TAB` (default `Members`)
  - `TURNSTILE_ENABLED` (stringbool, default false)
  - `GOOGLE_SERVICE_ACCOUNT_JSON`
  - `TURNSTILE_SECRET_KEY` (optional)
  - `ALERT_WEBHOOK_URL` (optional, must be `https://chat.googleapis.com/…`)

  Delete `APP_SECRET_ID`, `PORT`, `parseEnv`, `getConfig`, `fetchSecret` and the `secretsSchema` union.

- [ ] **Step 1: Rewrite `config.test.ts`:**
  - `describe(loadConfig)` with these cases:
    - "applies defaults": the minimal env gives `{sheet:{…Leads, Members}, turnstile:{enabled:false}, alertWebhookUrl: undefined, googleServiceAccount: SERVICE_ACCOUNT}`
    - "parses TURNSTILE_ENABLED from a string"
    - "rejects values that aren't a Sheet ID" (the existing message)
    - "rejects a missing service account" (throws `Invalid environment`)
    - "requires a Turnstile secret key while Turnstile is on" (the existing message)
    - "rejects a webhook URL that isn't Google Chat": `ALERT_WEBHOOK_URL: "https://evil.example/x"` throws
    - "ignores non-string bindings": `{...env, ASSETS: {}}` parses
  - Drop the Secrets Manager test.
- [ ] **Step 2:** Run `pnpm --filter web test worker/config` and confirm the new cases fail.
- [ ] **Step 3:** Rewrite `config.ts` as a single Zod object schema with `.transform` into `Config`, keeping `parseOrThrow` and the Turnstile discriminated union. Use `z.looseObject`, or pick only the known keys, so binding objects like `ASSETS` don't fail validation.
- [ ] **Step 4:** Update the callers to compile:
  - `handler.ts` `liveDeps` uses `loadConfig(process.env)` for now, synchronously
  - `scripts/init-sheet.ts` uses `loadConfig(process.env)`
  - delete `dev-server.ts` (Task 5 replaces it with the Vite plugin) and the `dev` script line, so nothing references `parseEnv`.

  Remove `@aws-sdk/client-secrets-manager` from `package.json`, and remove its entry from `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.

- [ ] **Step 5:** Run `pnpm typecheck && pnpm test`; all should pass. Run `pnpm check`, then commit with `refactor(worker): sync env-only config`.

---

### Task 3: WebCrypto Google token and function-based Sheets client

**Files:**

- Create: `apps/web/worker/google-token.ts`, `google-token.test.ts`, `sheets.test.ts`
- Modify: `apps/web/worker/sheets.ts`, `handler.ts` (`liveDeps`), `scripts/init-sheet.ts`
- Remove: the `google-auth-library` dependency

**Interfaces:**

- Produces:
  ```ts
  // google-token.ts
  export const getAccessToken: (account: ServiceAccount, fetchFn?: typeof fetch, now?: () => number) => Promise<string>;
  export const resetTokenCache: () => void;              // tests only
  // sheets.ts
  export const appendLead: (account: ServiceAccount, sheet: SheetConfig, leadRow: Cell[], memberRows: Cell[][]) => Promise<void>;
  export const ensureTabs: (account: ServiceAccount, sheet: SheetConfig, headers: Record<string, readonly string[]>) => Promise<string[]>;
  export const resetTabCache: () => void;                // tests only
  ```
- Token details:
  - JWT header `{alg:"RS256",typ:"JWT"}`
  - claims:
    - `iss = client_email`
    - `scope = "https://www.googleapis.com/auth/spreadsheets"`
    - `aud = "https://oauth2.googleapis.com/token"`
    - `iat = now`
    - `exp = now + 3600`
  - POST it as form data to `aud` with `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=<jwt>`, with an 8000 ms timeout
  - import the PEM `private_key` (PKCS#8) with `crypto.subtle.importKey("pkcs8", …, {name:"RSASSA-PKCS1-v1_5", hash:"SHA-256"})`
  - cache `{token, expiresAt}` in a module-level `Map` keyed by `client_email`
  - re-mint when `now >= expiresAt - 5 * 60_000`
  - share an in-flight promise, and drop it on rejection
  - a non-OK response throws `Error("Google token ${status}")` without the response body
- Tab IDs: module-level `Map<spreadsheetId, Promise<Map<title, sheetId>>>`, with the same "unknown tab → clear cache and throw" behaviour as today.

- [ ] **Step 1: Write `google-token.test.ts`.** Generate an RSA key pair in the test with `crypto.subtle.generateKey`, export it as a PKCS#8 PEM, and use a fake `fetchFn`. Cases:
  - "signs a JWT Google can verify": decode the `assertion` from the posted body, verify its signature with the public key, and assert the claims, including `exp - iat === 3600` and the scope
  - "reuses the token while valid": 2 calls, 1 fetch
  - "re-mints a token 5 minutes before expiry": advance `now` to `expires_in*1000 - 5*60_000` and expect a 2nd fetch
  - "does not cache a failed token request": the 1st fetch returns 500 and rejects with `Google token 500`; the 2nd call fetches again and succeeds
  - "shares one in-flight request": `Promise.all` of 2 calls, 1 fetch
- [ ] **Step 2: Write `sheets.test.ts`.** Stub the global `fetch` with `vi.stubGlobal` and mock `./google-token.ts`. Cases:
  - "appends lead and members in one batchUpdate": exactly one `:batchUpdate` POST with 2 `appendCells` requests, the correct `sheetId`s, and string cells as `stringValue` (a `"=SUM(A1)"` cell stays a `stringValue`)
  - "looks tab IDs up once across calls": 2 `appendLead` calls, 1 metadata GET
  - "throws and forgets the cache when a tab is missing"
  - "reports only Google's error status": a 403 body containing a cell value gives `Error("Sheets API 403 PERMISSION_DENIED")`
- [ ] **Step 3:** Run `pnpm --filter web test worker/google-token worker/sheets` and confirm they fail.
- [ ] **Step 4:** Implement `google-token.ts` (base64url helpers inline). Convert `SheetsClient` to the functions above, reusing the existing schemas, `widen`, `toRow` and `ensureTabs` logic unchanged. Update `liveDeps` so `append = (l, m) => appendLead(config.googleServiceAccount, config.sheet, l, m)`, and update `init-sheet.ts` to match. Remove `google-auth-library`.
- [ ] **Step 5:** Run `pnpm typecheck && pnpm test`; all should pass. Run `pnpm check`, then commit with `refactor(worker): WebCrypto Google auth, function-based Sheets client`.

---

### Task 4: `Request → Response` handler, stronger checks, alerts

**Files:**

- Modify: `apps/web/worker/handler.ts`, `handler.test.ts`, `utils.ts`
- Create: `apps/web/worker/alert.ts`, `alert.test.ts`
- Remove: the `@types/aws-lambda` dependency

**Interfaces:**

- Produces:
  ```ts
  // alert.ts
  export type AlertEvent = "sheet_write_failed" | "turnstile_unreachable";
  export const postAlert: (webhookUrl: string, event: AlertEvent, leadId: string | undefined, fetchFn?: typeof fetch) => Promise<void>; // never rejects
  // handler.ts
  export interface Deps { verify; append; now; newId; log; alert: (event: AlertEvent, leadId?: string) => void }
  export const createHandler: (deps: Deps) => (request: Request) => Promise<Response>;
  export const liveDeps: (config: Config, waitUntil: (p: Promise<unknown>) => void) => Deps;
  ```
- Alert body: `{ text: "insure-portal: <event>" + (leadId ? " (lead <leadId>)" : "") }`, POSTed as JSON with a 5000 ms timeout. Errors are swallowed and logged as `log.warn("alert_failed", { status | message })`.
- `liveDeps` sets `alert` to a no-op when `config.alertWebhookUrl` is undefined, and otherwise to `(e, id) => waitUntil(postAlert(url, e, id))`.
- Handler order:
  1. method check
  2. `Content-Length` over `MAX_BODY_BYTES` gives 413 before reading the body
  3. `await request.text()`, then `new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES` gives 413
  4. the JSON, bot, Zod, Turnstile and Sheets steps, unchanged
- Client IP comes from `request.headers.get("cf-connecting-ip") ?? undefined`.
- `json()` returns `Response.json(body, {status, headers:{"cache-control":"no-store"}})`.
- Call `deps.alert` right after the `turnstile_unreachable` and `sheet_write_failed` log calls, the latter with `leadId`.
- Delete `toApiEvent`, the `node:crypto` import and the `handler`/`live` exports from `handler.ts`. `newId` is `() => crypto.randomUUID()`.

- [ ] **Step 1: Write `alert.test.ts`.** Cases:
  - "posts the event and lead ID as a Chat message": assert the URL, the method and `JSON.parse(body).text === "insure-portal: sheet_write_failed (lead 7f3a…)"`
  - "never throws when the webhook fails": a fetch that rejects, and one that returns 500, both resolve to `undefined`
- [ ] **Step 2: Port `handler.test.ts` to `Request`:**
  - `event()` becomes `new Request("https://x.workers.dev/api/lead", {method, body, headers:{"cf-connecting-ip":"203.0.113.7","x-forwarded-for":"198.51.100.1"}})`
  - `parse()` reads `res.status` and `await res.json()`
  - keep all 13 existing cases; the IP assertion now expects `"203.0.113.7"` from `cf-connecting-ip`
  - add an `alert` mock to the deps
- [ ] **Step 3:** Add cases to `handler.test.ts`:
  - "rejects a declared Content-Length over 16 KB before reading": a `Request` whose body getter would throw (use a `ReadableStream` that errors on pull) with `content-length: "20000"` gives 413
  - "rejects bodies over 16 KB even without Content-Length": a streamed body with no length header gives 413 and no `append` call
  - "ignores x-forwarded-for for the Turnstile IP"
  - "alerts on a failed Sheet write with the lead ID": `alert` is called with `("sheet_write_failed", LEAD_ID)`
  - "alerts when Turnstile is unreachable"
  - "does not alert on rejections": invalid payload, honeypot and a failed Turnstile check give 0 `alert` calls
- [ ] **Step 4:** Run `pnpm --filter web test worker/handler worker/alert` and confirm the new and ported cases fail.
- [ ] **Step 5:** Implement `alert.ts`, the handler changes and `liveDeps`. Remove `@types/aws-lambda`, `esbuild`, and the `esbuild` entry in the catalog if nothing else uses it.
- [ ] **Step 6:** Run `pnpm typecheck && pnpm test`; all should pass. Run `pnpm check`, then commit with `refactor(worker): web Request/Response handler, Content-Length guard, Chat alerts`.

---

### Task 5: Worker entry, Wrangler config, Vite plugin, headers

**Files:**

- Create: `apps/web/worker/index.ts`, `apps/web/worker/index.test.ts`, `apps/web/wrangler.jsonc`, `apps/web/.dev.vars.example`, `apps/web/public/_headers`, `.node-version`
- Modify: `apps/web/vite.config.ts` (add `cloudflare()`, remove the proxy), `apps/web/package.json` (scripts and devDependencies), `apps/web/tsconfig.worker.json` (types), `.gitignore` (`.dev.vars`, `.wrangler`), `apps/web/worker/scripts/init-sheet.ts`
- Remove: `tsx`

**Interfaces:**

- Consumes:
  - `loadConfig(env)` (Task 2)
  - `createHandler` and `liveDeps(config, waitUntil)` (Task 4)
  - `log` from `log.ts`
- Produces: `export default { fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> }`

**`wrangler.jsonc`:**

- Top level:
  - `name: "insure-portal"`
  - `main: "./worker/index.ts"`
  - `compatibility_date`: today
  - `assets: { directory: "./dist/client", binding: "ASSETS", run_worker_first: ["/api/*"] }`
  - `observability: { enabled: true }`
  - `vars`: `SPREADSHEET_ID` (the prod ID, which the user supplies; leave `"REPLACE_WITH_PROD_SHEET_ID"` until then), `SHEET_LEADS_TAB`, `SHEET_MEMBERS_TAB`, `TURNSTILE_ENABLED: "true"`
- `env.dev`:
  - `name: "insure-portal-dev"`
  - the same `vars` with the dev `SPREADSHEET_ID`
  - `observability` repeated, since it isn't inherited
- Check the `assets.directory` value against what the plugin outputs: the Vite plugin writes the client to `dist/client` and generates the deploy config itself.

**Scripts:**

- `dev`: `vite --host`
- `build`: `tsc -b && vite build`
- `build:dev`: `CLOUDFLARE_ENV=dev vite build`. The Vite plugin chooses the environment at build time, so `wrangler deploy --env` isn't used.
- `deploy`: `wrangler deploy`
- `preview`: `vite preview`
- `cf-typegen`: `wrangler types worker/worker-configuration.d.ts`
- `sheet:init`: `node --env-file-if-exists=.dev.vars worker/scripts/init-sheet.ts`. `SPREADSHEET_ID` is passed inline when targeting prod.

- [ ] **Step 1: Write `index.test.ts`.** Cases:
  - "serves non-API paths from assets": `env.ASSETS.fetch` is a mock and receives the request
  - "returns 503 when the config is invalid": env `{}` on `POST /api/lead` gives 503 with body `{ok:false,error:"unavailable"}`, and `console.error` is called with `event: "config_invalid"`
  - "routes /api/lead to the handler": a valid env and a GET give 405
- [ ] **Step 2:** Run `pnpm --filter web test worker/index` and confirm it fails.
- [ ] **Step 3:** Implement `index.ts`:
  - if the path isn't `/api/lead`, return `env.ASSETS.fetch(request)`
  - otherwise, `try { config = loadConfig(env) } catch (e) { log.error("config_invalid", { message: String(e) }); return Response.json({ok:false,error:"unavailable"}, {status:503, headers:{"cache-control":"no-store"}}) }`
  - then `return createHandler(liveDeps(config, (p) => ctx.waitUntil(p)))(request)`

  Zod's `prettifyError` messages contain key names only, not values. Confirm `String(e)` doesn't echo a secret by keeping `jsonText` errors to "Not valid JSON".

- [ ] **Step 4:** Add the `wrangler` and `@cloudflare/vite-plugin` devDependencies. Add `cloudflare()` to `vite.config.ts` and remove `server.proxy`. Create `wrangler.jsonc`, then run `pnpm --filter web cf-typegen`. Switch `tsconfig.worker.json` `types` to the generated file. Create `.dev.vars.example`, a copy of the old `apps/api/.env.example` minus `PORT` and `SPREADSHEET_ID`. Note in it that the local Sheet ID goes in `.dev.vars` as `SPREADSHEET_ID=…`, which overrides `vars`. Add `.dev.vars` and `.wrangler` to `.gitignore`. Remove `tsx`.
- [ ] **Step 5:** Write `public/_headers`:
  ```
  /*
    Strict-Transport-Security: max-age=31536000; includeSubDomains
    X-Content-Type-Options: nosniff
    Referrer-Policy: strict-origin-when-cross-origin
    Permissions-Policy: camera=(), microphone=(), geolocation=()
    Content-Security-Policy: default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  /index.html
    Cache-Control: no-cache
  ```
- [ ] **Step 6: Verify env separation.**
  - Run `pnpm --filter web build && pnpm --filter web build:dev`.
  - Inspect the generated deploy configs under `dist/`. The prod config should have `name: insure-portal`, and the dev config `name: insure-portal-dev` with a different `SPREADSHEET_ID`.
  - Neither config should contain any secret value.
- [ ] **Step 7: Manual smoke test.**
  - Copy the example to `.dev.vars` and fill in the dev Sheet ID and dev service account.
  - Run `pnpm --filter web preview`, then `curl -sI localhost:4173/`. The response should show the CSP and HSTS headers.
  - Submit the form in the browser with Turnstile on and the test keys. A row should appear in the dev Sheet.
  - Run the Playwright e2e suite, `pnpm --filter web exec playwright test`. All should pass, because the API is mocked with `page.route`.
- [ ] **Step 8:** Run `pnpm check && pnpm typecheck && pnpm test`, then commit with `feat(web): run SPA and lead API as one Cloudflare Worker`.

---

### Task 6: Remove AWS, update docs, Workers Builds runbook

**Files:**

- Delete: `infra/`, `scripts/deploy-web.sh`
- Modify:
  - root `package.json`: drop `deploy:web`
  - `.gitignore`: drop the Terraform block
  - `turbo.json`: build `outputs` stays `dist/**`; add `CLOUDFLARE_ENV` and `VITE_*` to `env` so the cache varies by environment
  - `README.md`
- Modify memory/docs: none beyond the README

- [ ] **Step 1:** Delete the files and edits listed above. Run `grep -rniE "aws|lambda|cloudfront|terraform|secrets manager" --exclude-dir=node_modules --exclude-dir=docs .`. The only hits should be in the README history note, if any.
- [ ] **Step 2:** Rewrite these sections of the README:
  - **Layout:** `apps/web` = SPA + `worker/`
  - **Local development:** `.dev.vars`, `pnpm dev` runs the real Worker, `sheet:init`
  - **Scripts table**
  - **Deploying:** the runbook below
  - **Open items:** keep the compliance blocker, and the domain/WAF/rate-limit work for when the domain is bought

  The deploy runbook:
  1. Create the Cloudflare account and turn on 2FA. Choose the `workers.dev` subdomain.
  2. Run `pnpm --filter web exec wrangler login`.
  3. Do the first deploy, to create both Workers: `pnpm --filter web build && pnpm --filter web deploy`, then `pnpm --filter web build:dev && pnpm --filter web deploy`.
  4. Set the secrets for each Worker:
     - `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON` and `TURNSTILE_SECRET_KEY`, and also `ALERT_WEBHOOK_URL` for prod
     - add `--name insure-portal-dev` for the dev Worker
  5. Create the Turnstile widget, allowing the hostnames `insure-portal.<sub>.workers.dev` and `insure-portal-dev.<sub>.workers.dev`. The dev Worker uses the test keys instead.
  6. Create the Google Chat space and its incoming webhook.
  7. Workers Builds, prod connection:
     - repo `p0int-bl4nk/insure-portal`, root directory `apps/web`, production branch `main`
     - build command: `pnpm install --frozen-lockfile && pnpm -w check && pnpm -w typecheck && pnpm -w test && pnpm build`
     - deploy command: `pnpm exec wrangler deploy`
     - build variables: `VITE_TURNSTILE_ENABLED=true`, `VITE_TURNSTILE_SITE_KEY=<real>`
  8. Workers Builds, dev connection: production branch `development`, with non-production branch builds on. Same commands, except the build ends with `pnpm build:dev`. Build variables use the always-pass test site key.
  9. To roll back: `pnpm --filter web exec wrangler rollback`.

- [ ] **Step 3:** Confirm that Workers Builds supports the `packageManager: pnpm@12.21.0` pin and Node 24 (through `.node-version`) by checking the current Cloudflare docs. If either isn't supported, add a `PNPM_VERSION` or `NODE_VERSION` build variable to the runbook.
- [ ] **Step 4:** Run `pnpm install && pnpm check && pnpm typecheck && pnpm test && pnpm build`; all should pass. Then commit with `chore: remove AWS infrastructure, document Cloudflare deploy`.
