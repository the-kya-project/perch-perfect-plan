// Shared pieces for the free-user regression check (e2e/free-user/).
import { devices, expect, type Browser, type BrowserContext, type BrowserContextOptions, type Page, type Request } from "@playwright/test";

export const BASE_URL = (process.env.FREE_USER_BASE_URL ?? "").replace(/\/$/, "");
export const EMAIL = process.env.FREE_USER_EMAIL ?? "";
export const PASSWORD = process.env.FREE_USER_PASSWORD ?? "";
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

export function requireEnv(): void {
  const missing = [
    !BASE_URL && "FREE_USER_BASE_URL",
    !EMAIL && "FREE_USER_EMAIL",
    !PASSWORD && "FREE_USER_PASSWORD",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Missing env: ${missing.join(", ")}`);
}

/** Vercel previews sit behind Vercel login. One visit with the automation
 *  bypass secret sets a cookie for the preview host only, so the secret is
 *  never sent to Supabase or anywhere else. No-op for production. */
export async function passVercelProtection(context: BrowserContext): Promise<void> {
  if (!/\.vercel\.app$/.test(new URL(BASE_URL).hostname)) return;
  if (!BYPASS) throw new Error("VERCEL_AUTOMATION_BYPASS_SECRET is not set; the preview is behind Vercel login.");
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/?x-vercel-protection-bypass=${encodeURIComponent(BYPASS)}&x-vercel-set-bypass-cookie=samesitenone`);
  await page.close();
}

/** The phone the check runs as (contexts made by hand, not from the config). */
const { defaultBrowserType: _dbt, ...iPhone13 } = devices["iPhone 13"];
export const IPHONE: BrowserContextOptions = iPhone13;

// ── The iPhone Duo (wide) layout ───────────────────────────────────────────
// src/lib/duo.ts turns the side column on from a media query: landscape,
// ≥848 wide, ≥500 tall, touch only. Same size as e2e/duo.screens.ts.
export const DUO: BrowserContextOptions = {
  viewport: { width: 951, height: 669 },
  screen: { width: 951, height: 669 },
  isMobile: true,
  hasTouch: true,
};

export async function newContext(browser: Browser, opts: BrowserContextOptions = {}): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: BASE_URL, serviceWorkers: "block", locale: "en-US", timezoneId: "America/New_York", ...opts });
  await passVercelProtection(context);
  return context;
}

// ── Flock code must never load for a free account ──────────────────────────
// The community's own chunks: FlockShell-*, flock-* and flock.<child>-*.
// (FlockHealthDuo is the care app's all-birds health view, not the community.)
const FLOCK_CHUNK = /\/assets\/(FlockShell|flock(\.[\w-]+)?)-[\w-]+\.js(\?|$)/;
// Flock-only RPCs. flock_enabled is the gate itself and is allowed.
const FLOCK_RPC = /\/rest\/v1\/rpc\/(founding_status|admin_founding_claims|is_flock_member|admin_grant_entitlement|admin_revoke_entitlement|admin_set_flock_ui)\b/;
const FLOCK_TABLE = /\/rest\/v1\/(flock_settings|member_profiles|regions|entitlements|user_roles|founding_claims)\b/;

export type FlockLeak = { url: string; why: string };

/** Records any Flock chunk, RPC or table request the context makes. */
export function watchForFlock(context: BrowserContext): FlockLeak[] {
  const leaks: FlockLeak[] = [];
  context.on("request", (req: Request) => {
    const url = req.url();
    if (FLOCK_CHUNK.test(url)) leaks.push({ url, why: "Flock code chunk downloaded" });
    else if (FLOCK_RPC.test(url)) leaks.push({ url, why: "Flock RPC called" });
    else if (FLOCK_TABLE.test(url)) leaks.push({ url, why: "Flock table read" });
  });
  return leaks;
}

/** Starts listening for the app's own flock_enabled() call; await the result
 *  after the navigation that triggers it. */
export function nextFlockGate(page: Page): Promise<unknown> {
  return page
    .waitForResponse((r) => /\/rest\/v1\/rpc\/flock_enabled\b/.test(r.url()) && r.request().method() === "POST", { timeout: 45_000 })
    .then((r) => r.json());
}

// ── Getting around ─────────────────────────────────────────────────────────
/** The forest "Open in the Kya & Co. app" strip on iPhone browsers: dismiss
 *  it (never tap Open, which goes to the App Store). Session-only. */
export async function dismissOpenInApp(page: Page): Promise<void> {
  const notNow = page.getByRole("button", { name: "Not now", exact: true });
  if (await notNow.isVisible().catch(() => false)) await notNow.click();
}

/** The first-run welcome layer on Home: close it if it's up. */
export async function closeWelcome(page: Page): Promise<void> {
  const welcome = page.getByRole("button", { name: "Skip and add my bird" });
  if (await welcome.isVisible({ timeout: 4_000 }).catch(() => false)) {
    await page.getByRole("button", { name: "Close", exact: true }).first().click();
    await expect(welcome).toBeHidden();
  }
}

export async function signIn(page: Page): Promise<void> {
  await page.goto("/auth?mode=signin");
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await page.locator("#auth-email").fill(EMAIL);
  await page.locator("#auth-password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard(\?|$)/, { timeout: 60_000 });
}

/** The care tabs, and nothing else, in a nav. */
export async function expectOnlyCareTabs(nav: ReturnType<Page["locator"]>): Promise<void> {
  await expect(nav).toBeVisible();
  const links = nav.getByRole("link");
  await expect(links.filter({ hasText: /^Home$/ })).toHaveCount(1);
  await expect(links.filter({ hasText: /^Sits$/ })).toHaveCount(1);
  await expect(links.filter({ hasText: /^Health$/ })).toHaveCount(1);
  await expect(links.filter({ hasText: /^Explore$/ })).toHaveCount(1);
  await expect(links).toHaveCount(4);
  await expect(nav.locator('[data-coach="owner-tab-flock"]')).toHaveCount(0);
  await expect(nav.getByText("Community", { exact: true })).toHaveCount(0);
  await expect(nav.locator('a[href^="/flock"]')).toHaveCount(0);
}

// ── Production: block every write ──────────────────────────────────────────
export type Blocked = { method: string; url: string };

/** Lets only reads through. Allowed: GET/HEAD/OPTIONS anywhere except
 *  analytics; password sign-in and session refresh (/auth/v1/token); and the
 *  flock_enabled() RPC (stable, read-only). Everything else that could change
 *  something is aborted before it leaves the browser: REST inserts, updates
 *  and deletes, every other RPC, Edge Functions, the app's POST server
 *  functions and hooks, sign-out, and analytics (PostHog via /ingest). */
export async function blockAllWrites(context: BrowserContext): Promise<Blocked[]> {
  const blocked: Blocked[] = [];
  await context.route("**/*", async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const read = method === "GET" || method === "HEAD" || method === "OPTIONS";
    const note = () => blocked.push({ method, url: `${url.origin}${url.pathname}` });

    if (url.pathname.startsWith("/ingest") || /posthog/.test(url.hostname)) { note(); return route.abort(); }
    if (read) return route.continue();
    if (url.hostname.endsWith(".supabase.co")) {
      if (url.pathname === "/auth/v1/token") return route.continue();
      if (url.pathname === "/rest/v1/rpc/flock_enabled") return route.continue();
    }
    note();
    return route.abort();
  });
  return blocked;
}

/** "YYYY-MM-DD", n days from today in New York (the browser's time zone). */
export function dayFromToday(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
