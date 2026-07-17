/**
 * Privacy-friendly product analytics wrapper.
 *
 * Supports PostHog and Plausible. The provider and project key are read from
 * Vite env vars at build time, so the integration can be wired in by simply
 * dropping values into `.env` (or the Lovable Cloud build env) — no code
 * changes required.
 *
 * Supported env vars:
 *
 *   # Pick one provider
 *   VITE_ANALYTICS_PROVIDER=posthog        # or "plausible"
 *
 *   # PostHog
 *   VITE_POSTHOG_KEY=phc_xxx
 *   VITE_POSTHOG_HOST=https://eu.i.posthog.com   # optional, default /ingest (same-origin reverse proxy)
 *
 *   # Plausible
 *   VITE_PLAUSIBLE_DOMAIN=app.example.com
 *   VITE_PLAUSIBLE_HOST=https://plausible.io      # optional
 *
 * When no provider/key is configured, every call is a silent no-op so the app
 * runs identically in dev. Nothing is sent until a real key is dropped in.
 *
 * The wrapper:
 *  - Lazy-loads the vendor script on the client only (never during SSR).
 *  - Queues events fired before the script finishes loading and flushes after.
 *  - Strips obvious PII from event properties before sending. Never put email,
 *    names, tokens, URLs with tokens, or free-form notes into event props.
 *  - Hashes user identifiers before calling `identify` so PostHog never sees a
 *    raw Supabase auth UUID.
 */

// ---------------- Event catalogue ----------------

export type AnalyticsEventName =
  | "owner_signup"
  | "guided_editor_opened"
  | "care_plan_section_completed"
  | "care_plan_progress"
  | "sit_created"
  | "sit_edited"
  | "sitter_link_opened"
  | "health_scan_run"
  | "clip_viewed"
  | "care_sheet_viewed"
  | "marketing_opt_in_checked"
  // Journey events cherry-picked from PostHog's wizard PR (#255); sent
  // through this wrapper rather than its posthog-js provider rewrite.
  | "bird_added"
  | "weight_logged"
  | "care_plan_viewed"
  | "care_plan_editor_opened"
  | "view_as_sitter_opened"
  | "concern_flow_started"
  | "household_member_invited"
  | "bird_handoff_initiated"
  // Quickstart onboarding funnel (redesign/onboarding-quickstart). bird_added
  // doubles as the spec's bird_created, carrying extra_fields_expanded.
  | "onboarding_welcome_viewed"
  | "add_bird_opened"
  | "care_path_chosen"
  | "care_section_started"
  | "care_section_completed"
  | "guided_setup_saved_exit"
  | "guided_setup_completed";

type EventProps = Record<string, string | number | boolean | null | undefined>;

// ---------------- Config ----------------

type Provider = "posthog" | "plausible" | null;

// PostHog project key, hardcoded for production. It's a public client
// identifier (it ships in the page source of every site running PostHog,
// like the TikTok pixel ID) — not a secret. It lives here rather than in a
// Vercel env var because adding it as VITE_POSTHOG_KEY reliably broke
// Vercel's runtime env bundling (EnvFileReadError 500s on every request,
// reproduced twice on 2026-07-17). An env var still overrides when present.
const PROD_POSTHOG_KEY = "phc_qkMPyAbqFHDcG6FdXFBQUsiyPsbMjbCX2hNSw2bddPKh";

function readEnv(): {
  provider: Provider;
  posthogKey?: string;
  posthogHost: string;
  plausibleDomain?: string;
  plausibleHost: string;
} {
  // import.meta.env is statically inlined by Vite at build time.
  const env = (import.meta as any).env ?? {};
  // The hardcoded key applies in production builds only, so dev and previews
  // stay silent no-ops exactly as before.
  const posthogKey: string | undefined =
    env.VITE_POSTHOG_KEY || (import.meta.env.PROD ? PROD_POSTHOG_KEY : undefined);
  const raw = String(env.VITE_ANALYTICS_PROVIDER ?? "").toLowerCase().trim();
  let provider: Provider = null;
  if (raw === "posthog" && posthogKey) provider = "posthog";
  else if (raw === "plausible" && env.VITE_PLAUSIBLE_DOMAIN) provider = "plausible";
  else if (!raw) {
    // Auto-detect when provider not explicitly set.
    if (posthogKey) provider = "posthog";
    else if (env.VITE_PLAUSIBLE_DOMAIN) provider = "plausible";
  }
  return {
    provider,
    posthogKey,
    // Default goes through our reverse proxy (Nitro routeRules in
    // vite.config.ts → us.i.posthog.com) so ad blockers don't drop events.
    posthogHost: env.VITE_POSTHOG_HOST || "/ingest",
    plausibleDomain: env.VITE_PLAUSIBLE_DOMAIN || undefined,
    plausibleHost: env.VITE_PLAUSIBLE_HOST || "https://plausible.io",
  };
}

// ---------------- Internals ----------------

let booted = false;
let ready = false;
const queue: Array<() => void> = [];

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function flush() {
  ready = true;
  while (queue.length) {
    const fn = queue.shift();
    try { fn?.(); } catch { /* swallow analytics errors */ }
  }
}

/** SHA-256 → hex. Used to hash user ids before identify(). */
async function sha256Hex(input: string): Promise<string> {
  if (!isBrowser() || !window.crypto?.subtle) return input;
  const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Drop any property whose value looks like it could be PII. */
function scrub(props?: EventProps): EventProps {
  if (!props) return {};
  const out: EventProps = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    const lk = k.toLowerCase();
    if (/email|name|token|note|message|address|phone|url|path|file/.test(lk)) continue;
    if (typeof v === "string" && v.length > 80) continue; // long strings = likely user text
    out[k] = v;
  }
  return out;
}

function loadScript(src: string, attrs: Record<string, string> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) return resolve();
    const existing = document.querySelector(`script[data-analytics-src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = src;
    s.dataset.analyticsSrc = src;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}

// ---------------- PostHog adapter ----------------

async function bootPostHog(key: string, host: string) {
  // Load array.js first, then init directly on the loaded library. The old
  // hand-rolled stub queued ["init", ...] as a generic method call, but
  // array.js only replays init from its special `_i` queue — so the library
  // loaded and silently never initialized (empty token, no events). Verified
  // live on 2026-07-17: direct init on the loaded object beacons correctly.
  await loadScript(`${host}/static/array.js`);
  const ph = (window as any).posthog;
  if (!ph || typeof ph.init !== "function" || ph.__loaded) {
    flush();
    return;
  }
  ph.init(key, {
    api_host: host,
    // Required when api_host is a proxy path: links back to the PostHog app
    // (toolbar, debugging) still point at the real UI.
    ui_host: "https://us.posthog.com",
    capture_pageview: true,
    persistence: "localStorage+cookie",
    autocapture: false,
    disable_session_recording: true,
    respect_dnt: true,
    sanitize_properties: (p: any) => p,
  });
  flush();
}

// ---------------- Plausible adapter ----------------

async function bootPlausible(domain: string, host: string) {
  (window as any).plausible =
    (window as any).plausible ||
    function (...args: unknown[]) {
      ((window as any).plausible.q = (window as any).plausible.q || []).push(args);
    };
  await loadScript(`${host}/js/script.js`, { "data-domain": domain });
  flush();
}

// ---------------- Public API ----------------

/** Boot analytics. Call once on app mount. Safe to call repeatedly. */
export function initAnalytics() {
  if (booted || !isBrowser()) return;
  booted = true;
  const cfg = readEnv();
  if (!cfg.provider) {
    // No key configured — keep tracking calls as no-ops.
    flush(); // drain queued calls; they'll just no-op via dispatch()
    return;
  }
  if (cfg.provider === "posthog" && cfg.posthogKey) {
    bootPostHog(cfg.posthogKey, cfg.posthogHost).catch(() => flush());
  } else if (cfg.provider === "plausible" && cfg.plausibleDomain) {
    bootPlausible(cfg.plausibleDomain, cfg.plausibleHost).catch(() => flush());
  }
}

function dispatch(name: AnalyticsEventName, props: EventProps) {
  if (!isBrowser()) return;
  const cfg = readEnv();
  if (!cfg.provider) return;
  if (cfg.provider === "posthog") {
    const ph = (window as any).posthog;
    if (ph?.capture) ph.capture(name, props);
  } else if (cfg.provider === "plausible") {
    const pl = (window as any).plausible;
    if (typeof pl === "function") pl(name, { props });
  }
}

/** Track an event. Drops PII-shaped properties before sending. */
export function track(name: AnalyticsEventName, props?: EventProps) {
  const safe = scrub(props);
  const send = () => dispatch(name, safe);
  if (ready) send();
  else queue.push(send);
}

/** Identify the current user. The id is hashed before being sent. */
export async function identifyUser(userId: string | null | undefined) {
  if (!isBrowser() || !userId) return;
  const cfg = readEnv();
  if (cfg.provider !== "posthog") return; // Plausible has no user identity
  const hashed = await sha256Hex(`kya:${userId}`);
  const run = () => {
    const ph = (window as any).posthog;
    if (ph?.identify) ph.identify(hashed);
  };
  if (ready) run();
  else queue.push(run);
}

/** Clear identity on sign-out. */
export function resetUser() {
  if (!isBrowser()) return;
  const ph = (window as any).posthog;
  if (ph?.reset) ph.reset();
}
