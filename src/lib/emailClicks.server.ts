/**
 * Click tracking for the onboarding emails and The Flock Report.
 *
 * Every clickable link in those emails is rewritten, at send time, to
 *
 *   https://app.thekyaproject.com/r/<payload>.<sig>
 *
 * where <payload> is base64url JSON naming who got the email, which email,
 * which button variant, which link, the exact destination, and when it was
 * sent, and <sig> is an HMAC over it. /r/ (src/routes/r.$token.ts) checks the
 * signature, logs the click to email_clicks, and 302s to the destination.
 *
 * Signed rather than stored: the redirect needs no database read to know where
 * to go, so it stays fast and still works if the database is slow or down, and
 * nobody can mint a /r/ link to an address of their choosing (no open redirect).
 *
 * Reuses the /get-app pattern (storeRedirect.server.ts): the same platform,
 * in-app browser and crawler detection, the user agent read and thrown away,
 * and logging that never delays the redirect.
 *
 * NOT rewritten: unsubscribe and every other /api/ endpoint, sitter links,
 * anything carrying a token or auth code, assets (images, stylesheets), mailto/
 * tel, and anything that is not an <a href>. See shouldTrack().
 *
 * The signing key is CARE_PLAN_REMINDER_SECRET with its own "click:" prefix, the
 * same key the unsubscribe links use. Rotating it breaks outstanding /r/ links'
 * logging, not the links: a bad signature still redirects, to the app home.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { detectInAppBrowser, detectPlatform, isBot } from "./storeRedirect.server";
import type { EmailTag } from "./emailTracking";

export const APP_ORIGIN = "https://app.thekyaproject.com";

/** Where a /r/ link may send someone. Signed links are already safe; this is
 *  belt and braces against a leaked key. */
const ALLOWED_HOSTS = new Set([
  "app.thekyaproject.com",
  "thekyaproject.com",
  "www.thekyaproject.com",
  "apps.apple.com",
  "play.google.com",
]);

export type ClickVariant = "standard" | "no_bird";

export type ClickPayload = {
  /** Account the email went to. */
  u: string;
  /** Which email (its EmailTag, e.g. series_weighing, flock_report). */
  e: EmailTag;
  /** Button variant, onboarding only. */
  v: ClickVariant | null;
  /** Stable link key, e.g. cta_primary, settings, bird_weight. */
  k: string;
  /** Exact destination, query string and all. */
  d: string;
  /** Send time, epoch ms. Used to spot scanners that click on delivery. */
  t: number;
  /** A test send (the onboarding hook's testSend): the click is logged but
   *  flagged, and every report leaves it out. Absent on real sends. */
  x?: 1;
};

function key(): string {
  const s = process.env.CARE_PLAN_REMINDER_SECRET;
  if (!s) throw new Error("CARE_PLAN_REMINDER_SECRET is required to sign click links");
  return s;
}

const b64u = (b: Buffer) => b.toString("base64url");

function sign(body: string): string {
  // 128 bits is plenty for a link signature and keeps the URL short.
  return b64u(createHmac("sha256", key()).update(`click:${body}`).digest().subarray(0, 16));
}

export function clickToken(p: ClickPayload): string {
  const body = b64u(Buffer.from(JSON.stringify(p), "utf8"));
  return `${body}.${sign(body)}`;
}

/** The payload, or null when the token is malformed, tampered with, or points
 *  somewhere we would never send anyone. Never throws. */
export function readClickToken(token: string): ClickPayload | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const body = token.slice(0, dot);
    const got = Buffer.from(token.slice(dot + 1), "base64url");
    const want = Buffer.from(sign(body), "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ClickPayload;
    if (!p || typeof p.u !== "string" || typeof p.e !== "string" || typeof p.k !== "string" || typeof p.d !== "string") return null;
    const dest = new URL(p.d);
    if (dest.protocol !== "https:" || !ALLOWED_HOSTS.has(dest.hostname)) return null;
    return p;
  } catch {
    return null;
  }
}

export function trackedUrl(p: ClickPayload, base = APP_ORIGIN): string {
  return `${base}/r/${clickToken(p)}`;
}

/** Images, fonts, stylesheets — fetched by the mail client, never clicked. */
const ASSET_EXT = /\.(png|jpe?g|gif|webp|svg|ico|css|js|woff2?|ttf|mp4)$/i;
/** Paths that carry a credential or are not page views. */
const NEVER_PATHS = [/^\/api\//, /^\/r\//, /^\/sitter\//, /^\/invite\//, /^\/handoff\//, /^\/reset-password/, /^\/confirm-email/];
/** Query keys that smell like a credential. */
const SECRET_PARAM = /[?&](token|code|access_token|refresh_token|sig|signature|key|otp)=/i;

/** Should this URL go through the tracker? */
export function shouldTrack(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false; // mailto:, tel:, relative junk
  }
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.has(u.hostname)) return false;
  if (ASSET_EXT.test(u.pathname)) return false;
  if (NEVER_PATHS.some((re) => re.test(u.pathname))) return false;
  if (SECRET_PARAM.test(u.search)) return false;
  return true;
}

/**
 * A short, stable name for a link, derived from where it goes. Templates can
 * override it with data-link="…" on the <a> (the primary button does, as
 * cta_primary). Bird ids are never part of a key, so keys aggregate across
 * readers.
 */
export function linkKeyFor(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "other";
  }
  if (u.hostname !== "app.thekyaproject.com") {
    if (u.pathname.startsWith("/blog")) return "blog_article";
    if (u.hostname === "apps.apple.com") return "app_store";
    if (u.hostname === "play.google.com") return "play_store";
    return "website";
  }
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "open_app";
  if (parts[0] === "birds") {
    if (parts[1] === "new") return "add_bird";
    if (parts.length === 2) return "bird_record";
    return `bird_${parts[2].replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`;
  }
  if (parts[0] === "scans" && parts[1] === "settings") return "settings";
  return parts[0].replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

const decodeAmp = (s: string) => s.replace(/&amp;/g, "&");
const encodeAmp = (s: string) => s.replace(/&/g, "&amp;");

export type WrapContext = { userId: string; email: EmailTag; variant: ClickVariant | null; sentAt: number; test?: boolean };

/**
 * Rewrite every trackable <a href> in the HTML, and every trackable bare URL in
 * the text part, to a signed /r/ link. Runs AFTER the utm params are stamped
 * (tagHtmlLinks), so the destination keeps them and PostHog attribution is
 * unchanged. The text part reuses the HTML's key for the same destination, so
 * the plain-text button counts as cta_primary too.
 */
export function wrapEmailLinks(html: string, text: string | undefined, ctx: WrapContext, base = APP_ORIGIN): { html: string; text: string | undefined } {
  const keyByDest = new Map<string, string>();
  const payload = (dest: string, k: string): ClickPayload => ({
    u: ctx.userId, e: ctx.email, v: ctx.variant, k, d: dest, t: ctx.sentAt, ...(ctx.test ? { x: 1 as const } : {}),
  });

  const outHtml = html.replace(/<a\b([^>]*?)>/gi, (tag: string, attrs: string) => {
    const hrefM = attrs.match(/\bhref=(["'])(.*?)\1/i);
    if (!hrefM) return tag;
    const dest = decodeAmp(hrefM[2]);
    const dataM = attrs.match(/\sdata-link=(["'])(.*?)\1/i);
    let rest = dataM ? attrs.replace(dataM[0], "") : attrs;
    if (!shouldTrack(dest)) return dataM ? `<a${rest}>` : tag;
    const k = dataM?.[2] || linkKeyFor(dest);
    if (!keyByDest.has(dest) || dataM) keyByDest.set(dest, k);
    rest = rest.replace(hrefM[0], `href=${hrefM[1]}${encodeAmp(trackedUrl(payload(dest, k), base))}${hrefM[1]}`);
    return `<a${rest}>`;
  });

  const outText = text?.replace(/https:\/\/[^\s<>()"']+/g, (url) => {
    const m = url.match(/^(.*?)([.,;:!?]*)$/);
    const core = m ? m[1] : url;
    const tail = m ? m[2] : "";
    if (!shouldTrack(core)) return url;
    return `${trackedUrl(payload(core, keyByDest.get(core) ?? linkKeyFor(core)), base)}${tail}`;
  });

  return { html: outHtml, text: outText };
}

// ── Classifying a click ─────────────────────────────────────────────────────

/**
 * Link scanners, which open every link in an email on delivery to check it:
 * Microsoft Defender / Safe Links, Mimecast, Proofpoint, Barracuda and the
 * like, plus plain HTTP libraries. Checked on top of storeRedirect's isBot().
 * Apple Mail Privacy Protection fetches images, not links, so it never lands
 * here; the timing and burst rules below catch scanners whose user agent looks
 * like an ordinary browser.
 */
const SCANNER_UA = /headless|python-requests|python-urllib|aiohttp|curl\/|wget|go-http-client|java\/|okhttp|apache-httpclient|libwww|httpclient|node-fetch|axios|undici|phantomjs|barracuda|mimecast|proofpoint|safelinks|microsoft office|ms-office|outlook-ios-linkpreview|googleimageproxy|yahoo! slurp|bitdefender|trendmicro|symantec|zscaler|fortinet|sophos|forcepoint|cisco|ironport|checkpoint|avast|kaspersky|scanner|validator|monitor/i;

/** A human cannot read an email and click it faster than this after the send. */
export const TOO_FAST_MS = 20_000;

export type BotReason = "user_agent" | "no_user_agent" | "head_request" | "too_fast" | "burst";

export function classifyClick(o: { userAgent: string; method: string; sentAt: number; now: number }): { isBot: boolean; reason: BotReason | null } {
  const ua = o.userAgent.trim();
  if (o.method.toUpperCase() === "HEAD") return { isBot: true, reason: "head_request" };
  if (!ua) return { isBot: true, reason: "no_user_agent" };
  if (isBot(ua) || SCANNER_UA.test(ua)) return { isBot: true, reason: "user_agent" };
  if (o.sentAt && o.now - o.sentAt >= 0 && o.now - o.sentAt < TOO_FAST_MS) return { isBot: true, reason: "too_fast" };
  // "burst" (several different links in one email within seconds) is decided
  // in the database, where the earlier clicks are — see log_email_click().
  return { isBot: false, reason: null };
}

export { detectInAppBrowser, detectPlatform };
