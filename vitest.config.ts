import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Standalone vitest config on purpose: the app's vite.config.ts wires the full
// TanStack Start / Nitro / PWA build, none of which pure unit tests need (and
// some of which breaks under vitest). Only the @ alias is required.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
