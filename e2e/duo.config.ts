// iPhone Duo screenshots (e2e/duo.screens.ts): the hydration check's servers,
// one Chromium project. Run with `npm run screens:duo` after `node e2e/build.mjs`.
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: /duo\.screens\.ts$/,
  projects: [{ name: "duo", use: { browserName: "chromium" } }],
});
