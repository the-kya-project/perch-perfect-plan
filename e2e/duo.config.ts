// iPhone Duo screenshots (e2e/duo.screens.ts) and the screen inventory
// (e2e/duo.inventory.ts): the hydration check's app server, one Chromium
// project, and e2e/duo-mock-server.ts in place of mock-supabase.mjs so the
// app server's own Supabase requests get the same made-up data as the browser.
// Run with `npm run screens:duo` (it builds first).
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const servers = Array.isArray(base.webServer) ? base.webServer : [];
const MOCK_PORT = Number(process.env.MOCK_SUPABASE_PORT || 54399);

export default defineConfig({
  ...base,
  testMatch: /duo\.(screens|inventory)\.ts$/,
  projects: [{ name: "duo", use: { browserName: "chromium" } }],
  // One at a time: the stand-in server matches service-role calls to the
  // last signed-in screen's made-up data.
  workers: 1,
  fullyParallel: false,
  webServer: [
    {
      command: "npx --yes vite-node e2e/duo-mock-server.ts",
      url: `http://127.0.0.1:${MOCK_PORT}/__health`,
      env: { MOCK_SUPABASE_PORT: String(MOCK_PORT) },
      // Never reuse the hydration check's mock: it doesn't know this data.
      reuseExistingServer: false,
      timeout: 120_000,
      cwd: "..",
    },
    ...servers.slice(1),
  ],
});
