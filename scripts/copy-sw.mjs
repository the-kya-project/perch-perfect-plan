// Post-build step (chained after `vite build` in package.json).
//
// vite-plugin-pwa writes the finished service worker to dist/sw.js — the
// root outDir — but the client build (nitro vercel preset) deploys from
// .vercel/output/static, so the worker would never ship. The manifest is
// injected into dist/sw.js as the plugin's final act, after all build hooks,
// which is why this runs as a separate script rather than a vite plugin.
import { copyFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("../dist/sw.js", import.meta.url));
const dest = fileURLToPath(new URL("../.vercel/output/static/sw.js", import.meta.url));

// Refuse to ship a worker with no precache manifest: that means the plugin's
// injection step didn't run (or the output layout changed) and deploying it
// would silently regress caching. Hashed asset entries look like "url":"assets/…".
const sw = readFileSync(src, "utf8");
const entries = (sw.match(/["']url["']:\s*["']assets\//g) ?? []).length;
if (entries < 5) {
  console.error(`copy-sw: dist/sw.js has ${entries} precached asset entries — manifest injection failed, refusing to copy.`);
  process.exit(1);
}

copyFileSync(src, dest);
console.log(`copy-sw: sw.js → .vercel/output/static (${entries} precached asset entries).`);
