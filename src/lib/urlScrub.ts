// Redaction for anything URL-shaped that leaves the app for a third party
// (PostHog events + person properties, first-touch attribution → Supabase and
// Brevo). Pure and dependency-free on purpose: it is imported by the client
// bundle AND run directly by scripts/url-scrub.test.ts.
//
// Two kinds of secret travel in our URLs:
//  1. Path segments that ARE the credential — the sitter link, the household
//     invite, the bird handoff, and the signed public API links. Whoever holds
//     the URL holds the access, so the segment is replaced with a fixed
//     placeholder. The route stays intact so pageviews still group by route.
//  2. Auth material in the fragment / query (Supabase's implicit flow lands on
//     /welcome#access_token=<JWT>&refresh_token=…).
//
// Adding a route with a token or signature in its path? Add it to
// TOKEN_PATH_RULES and to the cases in scripts/url-scrub.test.ts.

// A path separator, literal or percent-encoded — a token route can ride inside
// another URL's query string (`?redirect=%2Finvite%2F<token>`).
const SEP = "(\\/|%2F)";
// One path segment. Stops at the next separator, query, fragment, or the start
// of any percent-escape, so the encoded form terminates correctly too.
const SEG = "[^\\/?#&%\\s\"'<>]+";

const TOKEN_PATH_RULES: Array<[RegExp, string]> = [
  // /sitter/<token>[/…], /invite/<token>, /handoff/<token>
  [new RegExp(`${SEP}(sitter|invite|handoff)${SEP}${SEG}`, "gi"), "$1$2$3[token]"],
  // /api/public/chart/<birdId>/<month>/<sig> — HMAC-signed weight chart image
  [
    new RegExp(`${SEP}chart${SEP}${SEG}${SEP}${SEG}${SEP}${SEG}`, "gi"),
    "$1chart$2[birdId]$3[month]$4[sig]",
  ],
  // /api/public/unsubscribe/<category>/<userId>/<sig> — signed, carries a raw user id
  [
    new RegExp(`${SEP}unsubscribe${SEP}(${SEG})${SEP}${SEG}${SEP}${SEG}`, "gi"),
    "$1unsubscribe$2$3$4[userId]$5[sig]",
  ],
];

// access_token, refresh_token, provider_token, id_token, token_hash, token, … plus
// OAuth `code` and our `sig`.
const TOKEN_PARAM_RE = /([\w-]*token[\w-]*|code|sig)=[^&#\s]*/gi;

/** Replace credential path segments with fixed placeholders. Safe on any string. */
export function redactTokenPaths(value: string): string {
  let out = value;
  for (const [re, replacement] of TOKEN_PATH_RULES) out = out.replace(re, replacement);
  return out;
}

// Anything JWT-shaped: Supabase access tokens, and the `token=` on signed
// Storage URLs (PostHog's web-vitals attribution records the LCP image URL,
// which for us is a signed bird photo).
const JWT_RE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]+)?/g;

/**
 * Redactions that are safe on ANY string, URL or not: token paths, token-ish
 * `key=value` pairs, and bare JWTs. Idempotent.
 */
export function redactSecrets(value: string): string {
  return redactTokenPaths(value).replace(TOKEN_PARAM_RE, "$1=REDACTED").replace(JWT_RE, "[jwt]");
}

/** Full URL scrub: everything in redactSecrets, plus the whole fragment. */
export function scrubUrl(value: string): string {
  // Drop the fragment entirely — Supabase's implicit flow puts tokens there.
  return redactSecrets(value.replace(/#.*$/, ""));
}

function isUrlKey(key: string): boolean {
  return (
    key === "url" ||
    key === "$current_url" ||
    key === "$pathname" ||
    key === "$referrer" ||
    key.endsWith("_url") ||
    key.endsWith("_pathname") ||
    key.endsWith("_referrer")
  );
}

function sanitizeValue(key: string, v: any): any {
  if (typeof v === "string") {
    if (isUrlKey(key) || v.includes("access_token") || v.includes("refresh_token")) {
      return scrubUrl(v);
    }
    // Every other string still gets the secret redaction: PostHog adds
    // URL-bearing properties under names we don't control
    // ($prev_pageview_pathname, title, web-vitals attribution, …) and a key
    // allow-list would silently miss the next one. Only the fragment strip is
    // key-gated, because "#" is ordinary text outside a URL.
    return redactSecrets(v);
  }
  if (Array.isArray(v)) return v.map((item) => sanitizeValue(key, item));
  if (v && typeof v === "object") return sanitizeAnalyticsProperties(v);
  return v;
}

/**
 * Scrub a PostHog property bag, recursively. $set / $set_once carry nested URL
 * props like $initial_current_url, so person properties are covered too.
 */
export function sanitizeAnalyticsProperties(props: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const key of Object.keys(props)) out[key] = sanitizeValue(key, props[key]);
  return out;
}

/**
 * PostHog `before_send` hook: the last stop before the network. Covers the
 * top-level $set / $set_once that `sanitize_properties` is not handed on every
 * code path. Returns the same event object, scrubbed.
 */
export function sanitizeAnalyticsEvent<T extends Record<string, any> | null>(event: T): T {
  if (!event) return event;
  for (const key of ["properties", "$set", "$set_once"]) {
    const bag = (event as Record<string, any>)[key];
    if (bag && typeof bag === "object") {
      (event as Record<string, any>)[key] = sanitizeAnalyticsProperties(bag);
    }
  }
  return event;
}
