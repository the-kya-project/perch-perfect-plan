// Care badges' before-and-after screenshots (e2e/care-badges.screens.ts): the
// iPhone Duo screenshots' setup (e2e/duo.config.ts: the made-up data from
// e2e/duo-fixture.ts, one Chromium project) for that one file.
// Run with `npm run test:care-badges:screens` (it builds first).
import { defineConfig } from "@playwright/test";
import duo from "./duo.config";

export default defineConfig({
  ...duo,
  testMatch: /care-badges\.screens\.ts$/,
});
