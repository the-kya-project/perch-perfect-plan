// Shared pieces for the iPhone hydration check: the error watcher, the app's
// own wording per language, and the fake iOS app shell.
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page, type ConsoleMessage } from "@playwright/test";
import { parseJsonc } from "../src/lib/i18n/jsonc";
import { DEFAULT_LOCALE } from "../src/lib/i18n/config";

export const MOCK = `http://127.0.0.1:${Number(process.env.MOCK_SUPABASE_PORT || 54399)}`;

// ── Wording ──────────────────────────────────────────────────────────────────
// The tests look for the same strings people see, read from the catalogs, so a
// new language needs no test changes. A key a new catalog hasn't translated yet
// falls back to English, as the app does.
const catalogCache = new Map<string, Record<string, string>>();
function catalog(locale: string): Record<string, string> {
  if (!catalogCache.has(locale)) {
    const file = fileURLToPath(new URL(`../src/locales/${locale}.jsonc`, import.meta.url));
    catalogCache.set(locale, existsSync(file) ? parseJsonc(readFileSync(file, "utf8")) : {});
  }
  return catalogCache.get(locale)!;
}
export function wording(locale: string, key: string): string {
  const s = catalog(locale)[key] ?? catalog(DEFAULT_LOCALE)[key];
  if (!s) throw new Error(`No "${key}" in the ${locale} or ${DEFAULT_LOCALE} catalog`);
  return s;
}

// ── What counts as a failure ─────────────────────────────────────────────────
// React's hydration errors: the page the server sent and the page the phone
// built didn't match, and React threw the server's away. In the production
// build they arrive as "Minified React error #NNN"; in dev, as sentences.
//   #418  hydration mismatch (text or element)
//   #421  a not-yet-hydrated part of the page got an update first
//   #422  error while hydrating a section; React fell back to rebuilding it
//   #423  error while hydrating; React rebuilt the whole page
//   #425  text content mismatch (React 18 wording of #418)
//   #520  error during an update; React re-rendered the whole page (seen with
//         #422 in production on iPhones, Oct 2026)
const HYDRATION = /Minified React error #(418|421|422|423|425|520)\b|Hydration failed|hydrat(ing|ion) (error|mismatch)|didn't match the client|did not match/i;

export type Problem = { kind: "hydration" | "uncaught"; text: string; url: string };

function describe(msg: ConsoleMessage): string {
  const loc = msg.location();
  return `${msg.text()}${loc.url ? `\n    at ${loc.url}:${loc.lineNumber}` : ""}`;
}

// React reports recovered errors (#418, #422, #520, …) through the browser's
// reportError(), wrapping the error that actually happened as `cause`. The
// wrapper's message only says how React recovered; the cause says why. This
// logs the cause next to it so a failure shows both.
const CAUSE_LOGGER = `(() => {
  const orig = window.reportError;
  if (typeof orig !== "function") return;
  window.reportError = function (e) {
    try {
      let c = e && e.cause, depth = 0;
      while (c && depth++ < 3) {
        console.error("[e2e-cause] " + (c.message || String(c)) + (c.stack ? "\\n" + String(c.stack).split("\\n").slice(0, 6).join("\\n") : ""));
        c = c.cause;
      }
    } catch (_) {}
    return orig.apply(this, arguments);
  };
})();`;

/** Collects hydration errors (console) and uncaught errors (page) for one page,
 *  each with the address the page was on and React's underlying cause. */
export function watch(page: Page): Problem[] {
  const problems: Problem[] = [];
  void page.addInitScript(CAUSE_LOGGER);
  const causes: string[] = [];
  page.on("console", (msg) => {
    if (msg.text().startsWith("[e2e-cause] ")) {
      const cause = msg.text().slice("[e2e-cause] ".length);
      // Attach to the React error it explains (logged just before it is thrown).
      causes.push(cause);
      return;
    }
    if ((msg.type() === "error" || msg.type() === "warning") && HYDRATION.test(msg.text())) {
      problems.push({ kind: "hydration", text: describe(msg), url: page.url() });
    }
  });
  page.on("pageerror", (err) => {
    const cause = causes.shift();
    problems.push({
      kind: HYDRATION.test(err.message) ? "hydration" : "uncaught",
      text: `${err.name}: ${err.message}${err.stack ? `\n${err.stack.split("\n").slice(1, 4).join("\n")}` : ""}${cause ? `\nCaused by: ${cause}` : ""}`,
      url: page.url(),
    });
  });
  return problems;
}

// What each error means, in plain words, printed with the failure.
const MEANING: Record<string, string> = {
  "418": "the page the server sent and the page the phone built show different text or elements",
  "421": "part of the page changed before React had finished checking it",
  "422": "React hit an error while checking part of the page and rebuilt that part",
  "423": "React hit an error while checking the page and rebuilt all of it",
  "520": "React hit an error while updating the page and re-rendered all of it",
  "425": "the page the server sent and the page the phone built show different text",
};
function explain(p: Problem): string {
  if (p.kind === "uncaught") return "the page threw an error nothing caught";
  const code = /#(\d{3})/.exec(p.text)?.[1];
  return (code && MEANING[code]) || "the page the server sent and the page the phone built don't match";
}

/** Fail with a readable list of everything that went wrong on this page. */
export function expectClean(problems: Problem[], where: string) {
  if (problems.length === 0) return;
  const report = problems
    .map((p, i) => `  ${i + 1}. ${p.kind === "hydration" ? "HYDRATION ERROR" : "UNCAUGHT ERROR"}: ${explain(p)}.\n     On: ${p.url}\n     ${p.text.split("\n").join("\n     ")}`)
    .join("\n");
  const info = base.info();
  const title = info.titlePath.slice(1).join(" ").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const hint = problems.some((p) => p.kind === "hydration") && process.env.E2E_DEV !== "1"
    ? `\n\n  To see exactly which text differs, run this one test against the dev server (e2e/README.md):\n    npm run test:hydration:dev -- --project ${info.project.name.replace(/^webkit-/, "chromium-")} --grep "${title}"`
    : "";
  throw new Error(`${where}: ${problems.length} problem(s)\n${report}${hint}`);
}

/** Load a page and let it finish hydrating and settle. */
export async function load(page: Page, path: string) {
  await page.goto(path, { waitUntil: "networkidle" });
  // Hydration of code-split parts, then the language switch, happen after
  // network idle; give them a moment so their errors are caught here.
  await page.waitForTimeout(800);
}

// ── Fixtures ─────────────────────────────────────────────────────────────────
type Fixtures = { locale_: string; problems: Problem[]; uniqueEmail: () => string };

export const test = base.extend<Fixtures & { kyaLocale: string }>({
  kyaLocale: ["en", { option: true }],
  locale_: async ({ kyaLocale }, use) => use(kyaLocale),
  problems: async ({ page }, use) => {
    // Only the app's own server and the mock Supabase: no fonts, analytics or
    // other outside calls, so a network blip can't fail the check.
    await page.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      return host === "127.0.0.1" || host === "localhost" ? route.continue() : route.abort();
    });
    await use(watch(page));
  },
  uniqueEmail: async ({ kyaLocale }, use, info) => {
    let i = 0;
    await use(() => `e2e-${kyaLocale}-${info.workerIndex}-${Date.now()}-${i++}@example.com`);
  },
});
export { expect };

/** Make the page look like the installed iOS app (Capacitor's injected global),
 *  before any app code runs. */
export async function asIOSApp(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { Capacitor: unknown }).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => "ios",
    };
  });
}

/** The page's language once loaded: <html lang>, set by the app after hydration. */
export async function pageLanguage(page: Page): Promise<string> {
  return page.evaluate(() => document.documentElement.lang);
}
