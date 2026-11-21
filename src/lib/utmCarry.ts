// Keep campaign attribution across our own redirects.
//
// Email links (src/lib/emailTracking.ts) and TikTok ads arrive with
// utm_source / utm_medium / utm_campaign / utm_content (and sometimes
// utm_term). PostHog reads them from the TOP LEVEL of the page URL when it
// records the pageview, and so does first-touch attribution
// (src/lib/attribution.ts). Our redirects used to drop them:
//   - a signed-in visitor on "/" went to a bare /dashboard (inline cold-launch
//     script in __root.tsx, and the "/" route's own redirects)
//   - a signed-out visitor on a signed-in page went to
//     /auth?mode=signin&redirect=<url>, with the UTMs only INSIDE redirect=
//   - an expired email link went to /link-expired without them
// Every such redirect now carries the UTM params at the top level. Nothing
// else is copied: these are campaign labels, never user data.
//
// Pure and dependency-free (also used by scripts/utm-carry.test.ts). The
// inline cold-launch script in __root.tsx repeats the same key list by hand,
// because it runs before any module loads — keep the two in sync.

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export type Utms = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/** The UTM params present in a search string ("?a=1&utm_source=x" or without "?"). */
export function pickUtms(search: string | null | undefined): Utms {
  const out: Utms = {};
  if (!search) return out;
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 200);
  }
  return out;
}

/** Add UTM params to an internal href, keeping any it already has. */
export function withUtms(href: string, utms: Utms): string {
  const entries = Object.entries(utms).filter(([, v]) => v) as Array<[string, string]>;
  if (!entries.length) return href;
  const hashAt = href.indexOf("#");
  const hash = hashAt >= 0 ? href.slice(hashAt) : "";
  const base = hashAt >= 0 ? href.slice(0, hashAt) : href;
  const qAt = base.indexOf("?");
  const path = qAt >= 0 ? base.slice(0, qAt) : base;
  const params = new URLSearchParams(qAt >= 0 ? base.slice(qAt + 1) : "");
  for (const [k, v] of entries) if (!params.has(k)) params.set(k, v);
  const qs = params.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash}`;
}
