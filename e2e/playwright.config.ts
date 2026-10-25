// The iPhone hydration check: every front-door page, in every language the app
// ships, on iPhone Safari emulation, against the real production build.
// Runs on every pull request (.github/workflows/hydration.yml). See
// e2e/README.md for how to run it locally and how to read a failure.
//
// Languages come from SUPPORTED_LOCALES (src/lib/i18n/config.ts): adding a
// language to the app adds it here, with no change to this file.
import { defineConfig, devices } from "@playwright/test";
import { SUPPORTED_LOCALES } from "../src/lib/i18n/config";

const APP_PORT = Number(process.env.E2E_APP_PORT || 4173);
const MOCK_PORT = Number(process.env.MOCK_SUPABASE_PORT || 54399);
// E2E_DEV=1 runs against `vite dev` instead of the production build: same
// tests, but React's errors come with a full server-vs-browser diff.
const DEV = process.env.E2E_DEV === "1";

// WebKit is Safari's engine; Chromium with the same iPhone profile is a second
// opinion and what runs where WebKit can't be installed. CI runs both; set
// E2E_BROWSERS=chromium (or webkit) to run one.
const BROWSERS = (process.env.E2E_BROWSERS || "webkit,chromium").split(",").map((b) => b.trim()).filter(Boolean);

const iPhone = devices["iPhone 13"];

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // a hydration error is never a flake to retry past
  workers: process.env.CI ? 2 : undefined,
  timeout: 60_000,
  reporter: process.env.CI ? [["list"], ["github"], ["html", { open: "never", outputFolder: "../playwright-report" }]] : [["list"]],
  outputDir: "../test-results",
  use: {
    baseURL: `http://127.0.0.1:${APP_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The service worker caches pages between tests; every visit must be a
    // fresh server render.
    serviceWorkers: "block",
  },
  projects: BROWSERS.flatMap((browser) =>
    SUPPORTED_LOCALES.map((locale) => ({
      name: `${browser}-${locale}`,
      use: {
        ...iPhone,
        // Same phone (size, user agent, touch) on either engine.
        browserName: browser as "webkit" | "chromium",
        defaultBrowserType: browser as "webkit" | "chromium",
        locale,
        // Read by the tests (e2e/helpers.ts) for the expected wording.
        kyaLocale: locale,
      },
    })),
  ),
  webServer: [
    {
      command: "node e2e/mock-supabase.mjs",
      url: `http://127.0.0.1:${MOCK_PORT}/__health`,
      env: { MOCK_SUPABASE_PORT: String(MOCK_PORT) },
      reuseExistingServer: !process.env.CI,
      cwd: "..",
    },
    {
      command: DEV ? `npx vite dev --host 127.0.0.1 --port ${APP_PORT} --strictPort` : "node e2e/serve-build.mjs",
      url: `http://127.0.0.1:${APP_PORT}/auth`,
      env: {
        PORT: String(APP_PORT),
        // Server-side Supabase for server functions (e.g. /link-expired's
        // confirmed check) → the mock. Dummy keys: nothing real is reachable.
        SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
        SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-key",
        SUPABASE_PROJECT_ID: "e2e",
        VITE_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
        VITE_SUPABASE_PROJECT_ID: "e2e",
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      cwd: "..",
    },
  ],
});
