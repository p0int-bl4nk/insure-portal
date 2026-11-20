import { defineConfig, devices } from "@playwright/test";

const PORT = 5174;
const CI = Boolean(process.env.CI);

/**
 * Browser tests for the lead wizard. The API is mocked per test with `page.route`,
 * so nothing reaches the API dev server or a Google Sheet.
 */
export default defineConfig({
  testDir: "./e2e",
  // `*.e2e.ts`, so Vitest's default `*.test`/`*.spec` glob never picks these up.
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    timezoneId: "Asia/Dubai",
    locale: "en-AE",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      // Customer-facing on phones: the full journeys again at phone size.
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      grep: /@journey/u,
    },
  ],
  webServer: {
    command: `vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !CI,
    // Set here so a local .env with Turnstile switched on can't leak into the tests.
    // CLOUDFLARE_ENV=dev runs the Worker with env.dev vars (the dev Sheet).
    env: { VITE_TURNSTILE_ENABLED: "false", CLOUDFLARE_ENV: "dev" },
  },
});
