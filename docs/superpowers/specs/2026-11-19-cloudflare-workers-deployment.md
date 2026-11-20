# Cloudflare Workers deployment

Agreed on 2026-11-19. This replaces the AWS deployment (Lambda, HTTP API, S3 + CloudFront, Secrets Manager, Terraform). Architecture diagram: https://claude.ai/artifact/GpuiFPmg4Y5pcKF8kxkB4i

## Goal

Run the lead form with as few moving parts as possible, on a managed platform outside the company stack, without losing any existing behaviour or safety check.

## Decisions

1. **Platform:** Cloudflare Workers, on the user's personal Cloudflare account. One Worker serves the built SPA (static assets) and `POST /api/lead` from the same origin.
2. **Environments:** two Workers, defined in one `wrangler.jsonc` with an `env.dev` block.

   | Worker | Deploys from | Sheet | Turnstile | Alerts |
   | --- | --- | --- | --- | --- |
   | `insure-portal` | `main` | prod | real keys | Google Chat webhook |
   | `insure-portal-dev` | `development` + PR previews | dev | always-pass test keys | none |

   No Cloudflare Access gate on dev.

3. **URLs:** `*.workers.dev` for now. A custom domain comes later, with DNS on Cloudflare, which turns on the WAF managed rules and one rate-limit rule for `/api/lead`.
4. **CI/CD:** Workers Builds, connected to `p0int-bl4nk/insure-portal`. `check`, `typecheck` and `test` must pass before any deploy. Rollback is `wrangler rollback`.
5. **Config:**
   - Non-secret values live in `wrangler.jsonc` `vars`.
   - Secrets are set with `wrangler secret put` per Worker; locally they come from `.dev.vars` (gitignored).
   - `VITE_TURNSTILE_*` are build variables, set on each Workers Builds connection.
   - All values reach the code through the Worker `env` object, which a synchronous Zod `loadConfig(env)` parses and validates.
6. **Monitoring:**
   - Workers Logs, with the same logging rules as today: identifiers and error codes, never field values.
   - On `sheet_write_failed` or `turnstile_unreachable`, the Worker posts `{event, leadId}` (no PII) to a Google Chat incoming webhook (`ALERT_WEBHOOK_URL`, prod only) via `ctx.waitUntil`, so the post never delays the user's response.
   - The submission-spike alarm is dropped.
7. **Layout:** `apps/api` merges into `apps/web/worker/`, with separate tsconfigs so browser code can't import worker code. `packages/shared` is unchanged.
8. **Code:**
   - **Handler:** takes a web `Request` and returns a `Response`. There's no memoised handler and no API Gateway shape.
   - **Google auth:** RS256 JWT signing with WebCrypto replaces `google-auth-library`. The `SheetsClient` class becomes plain functions, with module-level caches for the access token and the tab IDs.
   - **Removed:** `dev-server.ts`, the Vite `/api` proxy, the esbuild build, `tsx`, the AWS SDK, `@types/aws-lambda`, `infra/` and `scripts/deploy-web.sh`.

## Safety requirements (must hold after the move)

- The checks run in the same order as today: 405 for non-POST, the 16 KB body cap, JSON parse, the bot decoy (honeypot or too-fast gives a 200 with a fake reference and no write), Zod, Turnstile (403 or 503), then the Sheet write (503 on failure).
- **New:** reject with 413 when `Content-Length` declares more than 16 KB, before the body is read. The actual body size is still measured afterwards.
- **New:** the client IP sent to Turnstile comes from `cf-connecting-ip`, not `x-forwarded-for`.
- Sheet rows are still written in one atomic `batchUpdate`, as literal values only.
- Logs and alerts never contain names, mobiles, emails, IDs or health data.
- An invalid config fails loudly in the logs and returns `503 unavailable` to the user. It never returns a Cloudflare error page.
- Security headers are set on the static assets: CSP allowing Turnstile, HSTS, `X-Content-Type-Options`, `Referrer-Policy` and `frame-ancestors 'none'`.

## Out of scope

- Buying the custom domain, and the WAF and rate-limit rules that come with it.
- The compliance sign-off for PED and identity data stored in Google Sheets outside the UAE. This still blocks launch.
