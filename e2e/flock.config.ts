// The Community (Flock) shell check (e2e/flock.shell.ts): the hydration
// check's app server with the iPhone Duo stand-in (e2e/duo-mock-server.ts),
// one Chromium project, so a made-up signed-in admin (and non-admin) can open
// /flock with nothing real reached. Runs in the "iPhone hydration" job.
//
//   node e2e/build.mjs && npx playwright test -c e2e/flock.config.ts
import { defineConfig } from "@playwright/test";
import duo from "./duo.config";

export default defineConfig({
  ...duo,
  testMatch: /flock\.shell\.ts$/,
  projects: [{ name: "flock", use: { browserName: "chromium" } }],
});
