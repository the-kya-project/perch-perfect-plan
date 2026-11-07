// Shared pieces for the free-user regression check (e2e/free-user/).
import { expect, type BrowserContext, type Page, type Request } from "@playwright/test";

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

/** Vercel previews sit behind Vercel login. Visiting once with the automation
 *  bypass secret sets a cookie for the preview host only, so the secret is
 *  never sent to Supabase or anywhere else. No-op for production. */
export async function passVercelProtection(context: BrowserContext): Promise<void> {
  if (!BYPASS || !/\.vercel\.app$/.test(new URL(BASE_URL).hostname)) return;
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/?x-vercel-protection-bypass=${encodeURIComponent(BYPASS)}&x-vercel-set-bypass-cookie=samesitenone`);
  await page.close();
}

// ── Flock code must never load for a free account ──────────────────────────
// The community's own chunks: FlockShell-*, flock-* and flock.<child>-*.
// (FlockHealthDuo is the care app's all-birds health view, not the community.)
const FLOCK_CHUNK = /\/assets\/(FlockShell|flock(\.[\w-]+)?)-[\w-]+\.js(\?|$)/;
// Flock-only RPCs. flock_enabled is the gate itself and is allowed.
const FLOCK_RPC = /\/rest\/v1\/rpc\/(founding_status|admin_founding_claims|is_flock_member|admin_grant_entitlement|admin_revoke_entitlement|admin_set_flock_ui)\b/;
const FLOCK_TABLE = /\/rest\/v1\/(flock_|member_profiles|regions|entitlements|user_roles)/;

export type FlockLeak = { url: string; why: string };

/** Records any Flock chunk, RPC or table request a page makes. */
export function watchForFlock(page: Page): FlockLeak[] {
  const leaks: FlockLeak[] = [];
  page.on("request", (req: Request) => {
    const url = req.url();
    if (FLOCK_CHUNK.test(url)) leaks.push({ url, why: "Flock code chunk downloaded" });
    else if (FLOCK_RPC.test(url)) leaks.push({ url, why: "Flock RPC called" });
    else if (FLOCK_TABLE.test(url)) leaks.push({ url, why: "Flock table read" });
  });
  return leaks;
}

/** Reads the gate the way the app does, with the signed-in session's token. */
export async function flockEnabledFor(page: Page): Promise<boolean | string> {
  const res = page.waitForResponse((r) => /\/rest\/v1\/rpc\/flock_enabled\b/.test(r.url()), { timeout: 30_000 });
  const r = await res.catch(() => null);
  if (!r) return "no flock_enabled call seen";
  try { return (await r.json()) === true; } catch { return `status ${r.status()}`; }
}

// ── Sign in ────────────────────────────────────────────────────────────────
export async function signIn(page: Page): Promise<void> {
  await page.goto("/auth?mode=signin");
  // Some builds open on sign-up; switch if the sign-in form isn't showing.
  const password = page.locator('input[type="password"]').first();
  const email = page.locator('input[type="email"]').first();
  await expect(email).toBeVisible();
  const signInTab = page.getByRole("button", { name: /^(log in|sign in)$/i }).or(page.getByRole("tab", { name: /^(log in|sign in)$/i }));
  if (await page.getByLabel(/first name/i).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /already have an account|^log in$|^sign in$/i }).first().click();
  }
  await email.fill(EMAIL);
  await password.fill(PASSWORD);
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/auth"), { timeout: 45_000 });
  void signInTab;
}

// ── Production: block every write ──────────────────────────────────────────
// Read-only RPCs the app calls while just looking around. Anything else is a
// write until proven otherwise.
const READ_ONLY_RPCS = new Set([
  "flock_enabled", "is_admin", "has_app_premium", "my_birds", "get_my_profile",
]);

export type Blocked = { method: string; url: string };

/** Aborts every request that could change something: any non-GET/HEAD to
 *  Supabase except password sign-in and token refresh, and read-only RPCs on
 *  the allowlist; every non-GET to the app itself (server functions, API
 *  hooks); and analytics. Returns the list of what was blocked. */
export async function blockAllWrites(context: BrowserContext): Promise<Blocked[]> {
  const blocked: Blocked[] = [];
  await context.route("**/*", async (route) => {
    const req = route.request();
    const method = req.method();
    const url = new URL(req.url());
    const host = url.hostname;
    const readMethod = method === "GET" || method === "HEAD" || method === "OPTIONS";

    if (/posthog|i\.posthog\.com|sentry/.test(host)) {
      blocked.push({ method, url: `${url.origin}${url.pathname}` });
      return route.abort();
    }
    if (host.endsWith(".supabase.co")) {
      if (readMethod) return route.continue();
      if (url.pathname === "/auth/v1/token") return route.continue(); // sign in / refresh
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([\w]+)$/)?.[1];
      if (rpc && READ_ONLY_RPCS.has(rpc)) return route.continue();
      blocked.push({ method, url: `${url.origin}${url.pathname}` });
      return route.abort();
    }
    if (`${url.protocol}//${url.host}` === BASE_URL) {
      if (readMethod) return route.continue();
      blocked.push({ method, url: `${url.origin}${url.pathname}` });
      return route.abort();
    }
    // Any other host (fonts, images, CDNs): reads only.
    if (readMethod) return route.continue();
    blocked.push({ method, url: `${url.origin}${url.pathname}` });
    return route.abort();
  });
  return blocked;
}
