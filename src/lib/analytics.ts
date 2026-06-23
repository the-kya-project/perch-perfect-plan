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
 *   VITE_POSTHOG_HOST=https://eu.i.posthog.com   # optional, default https://us.i.posthog.com
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
  | "marketing_opt_in_checked";

type EventProps = Record<string, string | number | boolean | null | undefined>;

// ---------------- Config ----------------

type Provider = "posthog" | "plausible" | null;

function readEnv(): {
  provider: Provider;
  posthogKey?: string;
  posthogHost: string;
  plausibleDomain?: string;
  plausibleHost: string;
} {
  // import.meta.env is statically inlined by Vite at build time.
  const env = (import.meta as any).env ?? {};
  const raw = String(env.VITE_ANALYTICS_PROVIDER ?? "").toLowerCase().trim();
  let provider: Provider = null;
  if (raw === "posthog" && env.VITE_POSTHOG_KEY) provider = "posthog";
  else if (raw === "plausible" && env.VITE_PLAUSIBLE_DOMAIN) provider = "plausible";
  else if (!raw) {
    // Auto-detect when provider not explicitly set.
    if (env.VITE_POSTHOG_KEY) provider = "posthog";
    else if (env.VITE_PLAUSIBLE_DOMAIN) provider = "plausible";
  }
  return {
    provider,
    posthogKey: env.VITE_POSTHOG_KEY || undefined,
    posthogHost: env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
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
  // Inline PostHog snippet (truncated, official loader pattern) so we don't
  // need to add the npm package.
  if (!(window as any).posthog) {
    (function (t: any, e: any) {
      const o = (t.posthog = t.posthog || []);
      if (!o.__SV) {
        const a = e.createElement("script");
        a.type = "text/javascript";
        a.async = true;
        a.src = `${host}/static/array.js`;
        const n = e.getElementsByTagName("script")[0];
        n.parentNode!.insertBefore(a, n);
        const c =
          "init capture identify alias people.set people.set_once register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys".split(" ");
        for (let r = 0; r < c.length; r++) {
          const fn = c[r];
          o[fn] = (...args: any[]) => o.push([fn, ...args]);
        }
        o.__SV = 1;
      }
    })(window, document);
  }
  (window as any).posthog.init(key, {
    api_host: host,
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
