/**
 * Where a store link should land, and what we record about the visit.
 *
 * Shared by /get-app and /review. Both are opened from an inbox or a TikTok
 * bio, so the visitor is usually signed out and often inside an in-app browser
 * — the user agent is the only signal available.
 *
 * The UA is read and then THROWN AWAY. We keep what it tells us (platform,
 * in-app browser, bot) and never the string itself, and we never record an IP.
 */
export const APP_STORE_ID = "6795267221";
export const ANDROID_PACKAGE = "com.thekyaproject.app";

export const STORE = {
  ios: `https://apps.apple.com/app/id${APP_STORE_ID}`,
  android: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
  iosReview: `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`,
  androidReview: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}&showAllReviews=true`,
};

/** The three links we hand out. */
export type ClickEntry = "get" | "get-app" | "review";

/**
 * Which link was opened. Kept distinct so a TikTok-bio visit (`get`) can be
 * told apart from the launch email's button (`get-app`) and the review link,
 * even when all three carry the same UTMs.
 *
 * The `-qr` variants are a scan of the desktop chooser's QR code rather than a
 * click. They are recorded in `path` on purpose: a scan is genuinely a
 * different entry point, and reusing this column means no new column and no
 * UTM is overwritten to represent it. The existing daily view already groups
 * by `path`, so scans show up there with no query changes.
 */
export type ClickPath = ClickEntry | "get-qr" | "get-app-qr";

export type Resolved = "ios" | "android" | "chooser";
export type Platform = "ios" | "android" | "desktop" | "other";
export type InAppBrowser = "tiktok" | "instagram" | "facebook" | null;

/** The UTM keys we carry through, in a fixed order so URLs are stable. */
export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content"] as const;
export type Utms = Partial<Record<(typeof UTM_KEYS)[number], string>>;

/**
 * Longest UTM value we will carry. Anything past this is a mistake or someone
 * probing, and a store URL built from it would be rejected or truncated
 * downstream anyway.
 */
export const UTM_MAX_LENGTH = 100;

/**
 * Read the UTMs we recognize, and nothing else: any other query param on the
 * incoming link is ignored rather than forwarded, so a crafted URL cannot push
 * its own parameters into a store link or a logged row.
 */
export function readUtms(url: URL): Utms {
  const out: Utms = {};
  for (const k of UTM_KEYS) {
    const v = url.searchParams.get(k);
    if (v) out[k] = v.slice(0, UTM_MAX_LENGTH);
  }
  return out;
}

/**
 * Crawlers and link previewers. Checked BEFORE the in-app browser, because
 * TikTok's crawler is "Bytespider" while its in-app browser is
 * "BytedanceWebview" — counting the former as a real visit from a phone would
 * quietly inflate every campaign.
 */
export function isBot(ua: string): boolean {
  return /bot|crawler|spider|preview|facebookexternalhit|slackbot|twitterbot|googlebot|bytespider/i.test(ua);
}

export function detectPlatform(ua: string): Platform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Windows|X11|Linux|CrOS/i.test(ua)) return "desktop";
  return "other";
}

export function detectInAppBrowser(ua: string): InAppBrowser {
  if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) return "tiktok";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  return null;
}

/**
 * iPadOS reports itself as a Mac, so the touch hint is checked too. A `store`
 * override wins outright: the email badges always go to their own store,
 * whatever the reader is holding.
 */
export function resolveTarget(userAgent: string, storeOverride?: string | null): Resolved {
  if (storeOverride === "ios") return "ios";
  if (storeOverride === "android") return "android";
  const ua = userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && /Mobile|Touch/i.test(ua)) return "ios"; // iPadOS
  if (/Android/i.test(ua)) return "android";
  return "chooser";
}

/**
 * Apple's campaign token, in order of preference:
 *
 *   utm_source + "_" + utm_content   (tiktok_ad1)
 *   utm_source alone                 (tiktok)
 *   utm_campaign                     (launch)
 *
 * Lowercased, narrowed to the characters Apple accepts (a-z, 0-9, underscore,
 * hyphen) with anything else folded to an underscore, and capped at Apple's 40.
 * Returns null when there is nothing to build from, so a plain link is used.
 *
 * Hyphens survive deliberately: `utm_content=ad-1` reads as `ad-1` in App Store
 * Connect rather than being flattened into `ad_1`.
 */
export function campaignToken(utms: Utms): string | null {
  const raw = utms.utm_source
    ? [utms.utm_source, utms.utm_content].filter(Boolean).join("_")
    : (utms.utm_campaign ?? null);
  if (!raw) return null;
  const token = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    // Folding can butt an underscore against a literal one ("Tik Tok!_ad" ->
    // "tik_tok__ad"); collapse the run so the token stays readable.
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 40)
    // The cap can land mid-separator; don't ship a token ending in one.
    .replace(/[_-]+$/g, "");
  return token || null;
}

let warnedMissingProviderToken = false;

/**
 * The App Store URL, with campaign params when we can build them.
 *
 * `pt` is the provider token from APPLE_PROVIDER_TOKEN — never hardcoded. With
 * it missing we fall back to the plain link rather than sending a half-formed
 * one, and say so once per process instead of on every request.
 */
export function appStoreUrl(utms: Utms, opts: { review?: boolean } = {}): string {
  const base = opts.review ? STORE.iosReview : STORE.ios;
  const ct = campaignToken(utms);
  const pt = process.env.APPLE_PROVIDER_TOKEN;
  if (!ct) return base;
  if (!pt) {
    if (!warnedMissingProviderToken) {
      warnedMissingProviderToken = true;
      console.warn("[get-app] APPLE_PROVIDER_TOKEN is not set — App Store links ship without pt/ct, so Apple cannot attribute installs to a campaign.");
    }
    return base;
  }
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}pt=${encodeURIComponent(pt)}&ct=${encodeURIComponent(ct)}&mt=8`;
}

/**
 * The Play Store URL. Play wants the UTMs as ONE percent-encoded `referrer`
 * value, which is what surfaces in the Play Console acquisition reports.
 */
export function playStoreUrl(utms: Utms, opts: { review?: boolean } = {}): string {
  const base = opts.review ? STORE.androidReview : STORE.android;
  const inner = UTM_KEYS.filter((k) => utms[k]).map((k) => `${k}=${utms[k]}`).join("&");
  if (!inner) return base;
  return `${base}&referrer=${encodeURIComponent(inner)}`;
}

/** Re-attach the incoming UTMs to a link, for the desktop chooser's badges. */
export function withUtms(path: string, utms: Utms): string {
  const qs = UTM_KEYS.filter((k) => utms[k]).map((k) => `${k}=${encodeURIComponent(utms[k]!)}`).join("&");
  if (!qs) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${qs}`;
}

/**
 * Record the visit. Never throws, and the caller must not await it in a way
 * that delays the redirect — see the timeout in the route.
 *
 * The user agent is used here and discarded; only what it implies is stored.
 */
export async function logClick(o: {
  path: ClickPath;
  url: URL;
  userAgent: string;
  resolved: Resolved;
  referrer?: string | null;
  /** Vercel's x-vercel-ip-country. Two letters, or absent off-platform. */
  country?: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const utms = readUtms(o.url);
  // app_launch_clicks postdates the generated types, as the monthly hook's
  // tables do.
  const { error } = await (supabaseAdmin as any).from("app_launch_clicks").insert({
    path: o.path,
    utm_source: utms.utm_source ?? null,
    utm_medium: utms.utm_medium ?? null,
    utm_campaign: utms.utm_campaign ?? null,
    utm_content: utms.utm_content ?? null,
    resolved: o.resolved,
    platform: detectPlatform(o.userAgent),
    in_app_browser: detectInAppBrowser(o.userAgent),
    is_bot: isBot(o.userAgent),
    referrer: o.referrer ? o.referrer.slice(0, 400) : null,
    // Country, not IP. Vercel resolves it at the edge and we store only the
    // two-letter code, so there is nothing here that identifies a visitor.
    country: o.country ? o.country.slice(0, 2).toUpperCase() : null,
  });
  if (error) throw new Error(error.message);
}
