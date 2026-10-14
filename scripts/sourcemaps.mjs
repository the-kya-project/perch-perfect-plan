#!/usr/bin/env node
// Final build step, after `vite build` and copy-sw (see package.json "build"),
// so it sees exactly what will be deployed:
//
//   1. If PostHog credentials are present, inject chunk ids into the built
//      client JS and upload its source maps to PostHog error tracking, tagged
//      with the release (short commit SHA = the `web_build` tag on every error).
//   2. ALWAYS delete every .map file under .vercel/output and strip the
//      sourceMappingURL comments, so source maps are never publicly served.
//   3. Verify step 2 — fail the build if any map, or any reference to one,
//      survives. A deploy that would serve our source is worse than no deploy.
//
// Upload is best-effort: a PostHog outage or missing key must never block a
// deploy, so an upload failure is logged and the build continues (stack traces
// for that release are then minified). Step 2/3 are not best-effort.
//
// Credentials (Vercel build env, never committed): POSTHOG_CLI_API_KEY — a
// personal API key with "error tracking write" + "organization read" scopes —
// and POSTHOG_CLI_PROJECT_ID. Touches nothing outside the build output.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUTPUT = ".vercel/output";
const ASSETS = join(OUTPUT, "static", "assets");
const HOST = "https://us.posthog.com";
const RELEASE_NAME = "kya-web";
const RELEASE_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7);

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

function cli(args) {
  const r = spawnSync("npx", ["--no-install", "posthog-cli", "--host", HOST, ...args], {
    stdio: "inherit",
    env: process.env,
  });
  return r.status === 0;
}

// 1. Upload
if (process.env.POSTHOG_CLI_API_KEY && process.env.POSTHOG_CLI_PROJECT_ID) {
  const release = ["--release-name", RELEASE_NAME, "--release-version", RELEASE_VERSION];
  const ok =
    cli(["sourcemap", "inject", "--directory", ASSETS, ...release]) &&
    cli(["sourcemap", "upload", "--directory", ASSETS, ...release, "--delete-after"]);
  console.log(ok
    ? `sourcemaps: uploaded to PostHog as ${RELEASE_NAME}@${RELEASE_VERSION}`
    : "sourcemaps: WARNING upload failed — continuing; this release's stack traces will be minified");
} else {
  console.log("sourcemaps: no PostHog credentials in this environment — upload skipped");
}

// 2. Delete maps and strip references, whatever happened above.
const files = walk(OUTPUT);
let deleted = 0;
let stripped = 0;
for (const f of files) {
  if (f.endsWith(".map")) {
    unlinkSync(f);
    deleted++;
  }
}
const REF_RE = /\n?\/[/*][#@] sourceMappingURL=[^\s*]+\.map(?: ?\*\/)?\s*$/;
for (const f of files) {
  if (!/\.(m?js|css)$/.test(f)) continue;
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  if (REF_RE.test(text)) {
    writeFileSync(f, text.replace(REF_RE, "\n"));
    stripped++;
  }
}

// 3. Verify.
const leftovers = walk(OUTPUT).filter((f) => f.endsWith(".map"));
const refs = walk(join(OUTPUT, "static")).filter(
  (f) => /\.(m?js|css)$/.test(f) && /sourceMappingURL=\S+\.map/.test(readFileSync(f, "utf8")),
);
if (leftovers.length || refs.length) {
  console.error(`sourcemaps: FAILED — ${leftovers.length} .map file(s) and ${refs.length} reference(s) would be deployed`);
  process.exit(1);
}
console.log(`sourcemaps: ${deleted} map file(s) removed, ${stripped} reference(s) stripped — none will be served`);
