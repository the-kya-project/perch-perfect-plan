#!/usr/bin/env node
// Guard: nothing we serve may load Google Fonts.
//
// Linking fonts.googleapis.com / fonts.gstatic.com sends every visitor's IP
// address to Google, a GDPR data flow for EU users. The brand fonts are
// self-hosted in public/fonts (fonts.css) since #313; a Google Fonts link came
// back once by accident (ba1aa6f), so this check makes it impossible to ship.
//
//   npm run check:no-google-fonts          scan the source (src/, public/)
//   node scripts/no-google-fonts.mjs --build   also scan the build output
//
// It runs as the last step of `npm run build`, so a regression fails the
// Vercel build — the check every PR already shows — and never deploys.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// A URL on either Google Fonts host, with or without a scheme ("//host").
const GOOGLE_FONTS = /(?:https?:)?\/\/fonts\.(?:googleapis|gstatic)\.com/i;
const TEXT = /\.(?:[cm]?[jt]sx?|css|html?|json|svg|md)$/i;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".git")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (TEXT.test(name)) out.push(p);
  }
  return out;
}

const roots = ["src", "public"];
if (process.argv.includes("--build")) roots.push(".vercel/output/static", ".vercel/output/functions");

const hits = [];
for (const root of roots) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (GOOGLE_FONTS.test(line)) hits.push(`${relative(".", file)}:${i + 1}: ${line.trim().slice(0, 140)}`);
    });
  }
}

if (hits.length) {
  console.error("no-google-fonts: FAILED — Google Fonts must not be loaded (GDPR). Self-host in public/fonts/fonts.css instead:");
  for (const h of hits) console.error(`  ${h}`);
  process.exit(1);
}
console.log(`no-google-fonts: ok (${roots.join(", ")})`);
