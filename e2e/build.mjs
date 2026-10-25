// Production build for the iPhone hydration check: the real `vite build`,
// pointed at the mock Supabase (e2e/mock-supabase.mjs). The browser's Supabase
// address is baked in at build time, so this build is for the check only and
// is never deployed (Vercel builds its own).
import { spawnSync } from "node:child_process";

const mock = `http://127.0.0.1:${Number(process.env.MOCK_SUPABASE_PORT || 54399)}`;
const env = {
  ...process.env,
  VITE_SUPABASE_URL: mock,
  VITE_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
  VITE_SUPABASE_PROJECT_ID: "e2e",
  SUPABASE_URL: mock,
  SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key",
  SUPABASE_PROJECT_ID: "e2e",
};
// Never a Vercel environment: no analytics key, no preview guards.
delete env.VERCEL_ENV;
const r = spawnSync("npx", ["vite", "build"], { stdio: "inherit", env });
process.exit(r.status ?? 1);
