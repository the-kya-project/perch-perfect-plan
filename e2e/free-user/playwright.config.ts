// The free-user regression check (.github/workflows/free-user-regression.yml).
// Runs against a deployed app, never a local build:
//   staging     the PR's Vercel preview (Supabase staging), full care flows
//   production  app.thekyaproject.com, read-only (every write blocked)
//
// Env: FREE_USER_BASE_URL, FREE_USER_EMAIL, FREE_USER_PASSWORD, and for a
// preview VERCEL_AUTOMATION_BYPASS_SECRET. Run one project:
//   npx playwright test -c e2e/free-user/playwright.config.ts --project staging
import { defineConfig, devices } from "@playwright/test";

const iPhone = devices["iPhone 13"];

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  // No retries: the steps build on each other (one account, one bird, one
  // sit), so a retry would start over on an account that already has them.
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never", outputFolder: "../../playwright-report-free-user" }]]
    : [["list"]],
  outputDir: "../../test-results-free-user",
  use: {
    baseURL: process.env.FREE_USER_BASE_URL,
    ...iPhone,
    browserName: "chromium",
    defaultBrowserType: "chromium",
    locale: "en-US",
    timezoneId: "America/New_York",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    { name: "staging", testMatch: /free-user\.spec\.ts$/ },
    { name: "production", testMatch: /production\.spec\.ts$/ },
  ],
});
