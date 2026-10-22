/**
 * The page a desktop visitor gets from /get-app or /review.
 *
 * Its only job is to move the link to a phone, so the QR is the point and the
 * badges are the fallback. The app's own look (see BASE_CSS), hand-written rather than pulled
 * from the email shell: that shell builds a whole email document (preheader,
 * unsubscribe footer, disclaimer), none of which belongs on a web page.
 */
import qrcode from "qrcode-generator";
import { STORE, UTM_KEYS, playStoreAppUrl, playStoreUrl, withUtms, type Utms } from "./storeRedirect.server";

/** Where absolute URLs point when the caller does not say. */
const PROD_ORIGIN = "https://app.thekyaproject.com";

/**
 * The share image for link previews: a purpose-built 1200x630 card, the 1.91:1
 * ratio Facebook, Slack, iMessage and X all size for, so nothing is cropped.
 *
 * Stored as JPEG rather than the WebP it was delivered as. WebP previews
 * unreliably in iMessage and some DM clients, which is exactly where this link
 * gets shared. EXIF was stripped on the way in — the right-hand side is a real
 * photo, and a share card has no business carrying camera or location data.
 *
 * Declaring the dimensions lets a scraper lay out the card before it has
 * finished fetching the image, which is the difference between a card that
 * renders immediately and one that pops in late or not at all on first share.
 */
const SHARE_IMAGE = "/brand/share-card.jpg";
const SHARE_IMAGE_WIDTH = "1200";
const SHARE_IMAGE_HEIGHT = "630";
const SHARE_IMAGE_ALT = "Kya & Co. bird care app";

/**
 * Fallback QR asset for /get and /get-app, if QR generation ever fails. It
 * encodes https://app.thekyaproject.com/get-app?utm_source=email&utm_campaign=app-launch&utm_content=qr
 * (the launch email's download link), so it must never stand in for /review.
 */
const STATIC_QR = "/brand/store/get-app-qr.png";

// The app's design system (src/components/kya.tsx), restated here because this
// is server-built HTML: forest header with the logo, mist body with rounded top
// corners, white cards, Newsreader headings, DM Sans text, sunflower main button.
const FOREST = "#1a3d2e";
const MIST = "#f1f5f0";
const SUNFLOWER = "#f2b33d";
const PALE_GREEN = "#d6e8dc";
const MUTED = "#5f5e5a";
const MOSS = "#2d6a4f";
const BODY = "'DM Sans','Helvetica Neue',Helvetica,'Segoe UI',sans-serif";
const HEAD = "'Newsreader',Georgia,serif";
/** The same lockup the app's forest headers use (BrandLockup horizontal, ink). */
const LOGO = "/brand/lockups/horizontal-ink.svg";
/** The same Google Fonts request as the app (__root.tsx). */
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Newsreader:opsz,wght@6..72,600;6..72,700&display=swap" />`;

/** Shared styles for both pages: header, mist body, white card, text. */
const BASE_CSS = `
  body { margin:0; background:${MIST}; color:${FOREST}; font-family:${BODY}; -webkit-text-size-adjust:100%; }
  .head { background:${FOREST}; color:#fff; }
  .head-in { max-width:520px; margin:0 auto; box-sizing:border-box; padding:calc(env(safe-area-inset-top) + 18px) calc(env(safe-area-inset-right) + 20px) 46px calc(env(safe-area-inset-left) + 20px); text-align:center; }
  .logo { display:block; width:118px; height:auto; margin:0 auto; }
  h1 { margin:28px 0 0; font-family:${HEAD}; font-size:30px; line-height:1.15; font-weight:700; color:#fff; }
  .line { margin:8px auto 0; max-width:36ch; font-size:15px; line-height:1.5; color:${PALE_GREEN}; }
  .body { position:relative; margin:-26px auto 0; max-width:520px; box-sizing:border-box; border-radius:26px 26px 0 0; background:${MIST}; padding:20px calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 40px) calc(env(safe-area-inset-left) + 16px); }
  .card { background:#fff; border-radius:20px; padding:24px 20px; text-align:center; }
  p { margin:0 0 20px; font-size:15px; line-height:1.55; color:${MUTED}; }
  @media (max-width:420px) { h1 { font-size:26px; } }`;

/**
 * First-touch attribution for desktop visitors to /get and /get-app.
 *
 * This page is server-built HTML, so the app's captureFirstTouch (attribution.ts)
 * never runs here. Without this, someone who lands from a campaign link (the
 * printed postcard's QR, a bio link) and later signs up on the web from the same
 * browser would be credited to "direct". It writes the same localStorage key in
 * the same shape, with the same first-touch rule (never overwrite), so the app
 * picks it up at signup unchanged.
 *
 * UTMs are read from location.search in the browser rather than interpolated
 * from the server, so nothing from the query string is written into the script.
 * The referrer is kept to its origin: a same-origin referrer could be a
 * tokened path, and this runs without attribution.ts's scrubber.
 */
const FIRST_TOUCH_SCRIPT = `<script>
  try {
    var K = "ppc_attribution_first_touch";
    if (!localStorage.getItem(K)) {
      var p = new URLSearchParams(location.search);
      var g = function (k) { return (p.get(k) || "").trim(); };
      var ref = "";
      try { ref = document.referrer ? new URL(document.referrer).origin + "/" : ""; } catch (e) {}
      var source = g("utm_source"), medium = g("utm_medium");
      if (!source) {
        if (ref) { source = new URL(ref).hostname.replace(/^www\\./, ""); if (!medium) medium = "referral"; }
        else { source = "direct"; if (!medium) medium = "direct"; }
      }
      localStorage.setItem(K, JSON.stringify({
        source: source, medium: medium, campaign: g("utm_campaign"), term: g("utm_term"),
        content: g("utm_content"), referrer: ref, landing_page: location.pathname + location.search,
        first_seen_at: new Date().toISOString()
      }));
    }
  } catch (e) {}
</script>`;

/** Escape a string for use inside a double-quoted HTML attribute. */
function attr(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The QR an on-screen visitor scans with their phone.
 *
 * Generated per request rather than served as a static asset, because it has to
 * carry this visitor's UTMs: someone who landed here from a TikTok ad and then
 * scans the code should still be attributed to that ad once they are on their
 * phone. A static PNG cannot do that.
 *
 * `qr=1` rides along so the scan is distinguishable from a click. It is not a
 * UTM and is never forwarded to a store — readUtms ignores it.
 *
 * Never throws: a QR that cannot be built (an absurdly long URL exceeding the
 * format's capacity) falls back to `fallback` rather than 500ing a page whose
 * whole job is to hand someone a link.
 */
function qrMarkup(target: string, fallback: string): string {
  try {
    const qr = qrcode(0, "M");
    qr.addData(target);
    qr.make();
    // scalable: the SVG carries a viewBox and sizes from CSS, so the .qr rule
    // below keeps controlling the rendered size.
    return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
  } catch {
    return fallback;
  }
}

/**
 * `basePath` is the entry point the visitor actually used — /get or /get-app.
 * The badges and the QR both go back through that same path so a desktop
 * visitor who taps or scans is counted under the link they really followed.
 * Defaults to /get-app, which is what the launch email's links use.
 *
 * `origin` makes the QR and og:url absolute, which both have to be. It comes
 * from the request so a preview deploy advertises itself rather than
 * production.
 */
export function chooserPage(
  kind: "get" | "review",
  utms: Utms = {},
  opts: { basePath?: "/get" | "/get-app"; origin?: string } = {},
): string {
  const basePath = opts.basePath ?? "/get-app";
  const origin = (opts.origin ?? PROD_ORIGIN).replace(/\/$/, "");
  const title = kind === "get" ? "Get Kya &amp; Co. on your phone" : "Leave a review from your phone";
  // Back through the redirect rather than straight to the store, so a desktop
  // visitor who taps a badge is counted and attributed like everyone else.
  const ios = kind === "get" ? withUtms(`${basePath}?store=ios`, utms) : STORE.iosReview;
  const android = kind === "get" ? withUtms(`${basePath}?store=android`, utms) : STORE.androidReview;

  // /get and /get-app: the QR points back through this same entry path,
  // carrying the UTMs plus qr=1. /review: the QR opens /review itself, which on
  // a phone goes straight to that store's review flow — what the page says
  // scanning does. (It used to show the static get-app-qr.png, which encodes
  // the launch email's /get-app download link, so a scan opened the store
  // listing rather than the review.)
  const utmQs = UTM_KEYS.filter((k) => utms[k])
    .map((k) => `${k}=${encodeURIComponent(utms[k]!)}`)
    .join("&");
  const qrTarget = kind === "get" ? `${origin}${basePath}?${utmQs ? `${utmQs}&` : ""}qr=1` : `${origin}/review`;
  const qrFallback =
    kind === "get" ? `<img src="${STATIC_QR}" width="200" height="200" alt="" />` : "";
  const qrInner = qrMarkup(qrTarget, qrFallback);
  const hasQr = qrInner.trim().length > 0;

  // No QR at all (generation failed and there is no static stand-in, i.e.
  // /review): don't tell the visitor to scan a code that isn't there — show
  // the link itself to open on their phone instead.
  const blurb =
    kind === "get"
      ? "Scan the code with your phone's camera, or open the store you use."
      : hasQr
        ? "Reviews are written from the store app on your phone. Scan the code, or open the store you use."
        : "Reviews are written from the store app on your phone. Open this link on your phone, or open the store you use.";

  // data-qr-target states in the markup what the code actually encodes, so
  // "where does this QR go?" is answerable from view-source or a curl rather
  // than by pointing a phone at it.
  const qr = hasQr
    ? `<div class="qr" data-qr-target="${attr(qrTarget)}">${qrInner}</div>`
    : `<p class="qr-link"><a href="${attr(qrTarget)}">${attr(qrTarget.replace(/^https?:\/\//, ""))}</a></p>`;

  // Link-preview tags. Only /get gets them: it is the link that goes in bios
  // and DMs, and this copy is written for it. og:url is the clean canonical
  // path, deliberately without the UTMs.
  const SHARE_TITLE = "Kya & Co. | Your birds' care, all in one place";
  const SHARE_DESC =
    "A free app for documenting your birds' care, from care plans and diet to daily weights and health notes, shared with everyone who helps care for them.";
  const preview =
    kind === "get"
      ? `
<meta property="og:site_name" content="Kya &amp; Co." />
<meta property="og:type" content="website" />
<meta property="og:url" content="${attr(`${origin}${basePath}`)}" />
<meta property="og:title" content="${attr(SHARE_TITLE)}" />
<meta property="og:description" content="${attr(SHARE_DESC)}" />
<meta property="og:image" content="${attr(`${origin}${SHARE_IMAGE}`)}" />
<meta property="og:image:width" content="${SHARE_IMAGE_WIDTH}" />
<meta property="og:image:height" content="${SHARE_IMAGE_HEIGHT}" />
<meta property="og:image:alt" content="${attr(SHARE_IMAGE_ALT)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${attr(SHARE_TITLE)}" />
<meta name="twitter:description" content="${attr(SHARE_DESC)}" />
<meta name="twitter:image" content="${attr(`${origin}${SHARE_IMAGE}`)}" />
<meta name="twitter:image:alt" content="${attr(SHARE_IMAGE_ALT)}" />`
      : "";

  const firstTouch = kind === "get" ? `\n${FIRST_TOUCH_SCRIPT}` : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="${FOREST}" />
<title>${title.replace(/&amp;/g, "&")} — Kya &amp; Co.</title>${preview}${firstTouch}
${FONTS}
<style>${BASE_CSS}
  .qr { width:200px; height:200px; display:block; margin:0 auto 22px; border-radius:12px; background:#fff; padding:10px; box-sizing:content-box; }
  /* The generated QR is an inline <svg> inside .qr — make it fill the box. */
  .qr svg, .qr img { display:block; width:100%; height:100%; }
  /* The link-only fallback when no QR could be built. */
  .qr-link { margin:0 0 22px; font-size:16px; }
  .qr-link a { color:${MOSS}; font-weight:700; word-break:break-all; display:inline-flex; align-items:center; min-height:44px; }
  .badges { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; align-items:center; }
  /* Each badge is at least a 44px tap target: 48px tall, and the link itself
     is a 48px-tall box so the whole badge (not just its pixels) takes the tap. */
  .badges a { display:inline-flex; align-items:center; min-height:48px; }
  .badges img { display:block; height:48px; width:auto; }
</style>
</head><body>
  <header class="head">
    <div class="head-in">
      <img class="logo" src="${LOGO}" width="118" alt="Kya &amp; Co." />
      <h1>${title}</h1>
      <p class="line">${blurb}</p>
    </div>
  </header>
  <main class="body">
    <div class="card">
      ${qr}
      <div class="badges">
        <a href="${ios}"><img src="/brand/store/app-store-badge.svg" width="144" height="48" alt="Download on the App Store" /></a>
        <a href="${android}"><img src="/brand/store/google-play-badge.png" width="124" height="48" alt="Get it on Google Play" /></a>
      </div>
    </div>
  </main>
</body></html>`;
}

/**
 * What an Android visitor inside TikTok's browser gets from /get instead of a
 * redirect (see needsAndroidHandoff). A redirect there loads the Play website
 * inside TikTok, where Install goes nowhere; a tapped `market://` link is handed
 * to the Play Store app. It has to be a tap: webviews generally refuse to open
 * another app from a redirect or script without one, and a refused navigation
 * can replace this page with an error screen.
 *
 * The web listing stays on the page as the fallback, with the "open in browser"
 * hint for webviews that won't hand off at all.
 */
export function androidHandoffPage(utms: Utms = {}, opts: { basePath?: "/get" | "/get-app" } = {}): string {
  const app = playStoreAppUrl(utms);
  const web = playStoreUrl(utms);
  // Each button pings back through the same entry path with tap=app|web before
  // following its link, so taps are counted like every other visit. keepalive
  // lets the ping finish after the page hands off; a failed ping is ignored.
  const basePath = opts.basePath ?? "/get";
  const tapApp = withUtms(`${basePath}?tap=app`, utms);
  const tapWeb = withUtms(`${basePath}?tap=web`, utms);
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="${FOREST}" />
<title>Get Kya &amp; Co. on Google Play</title>
${FONTS}
<style>${BASE_CSS}
  /* The one sunflower main button: 2px forest border, 52px tall. */
  .cta { display:flex; align-items:center; justify-content:center; box-sizing:border-box; min-height:52px; background:${SUNFLOWER}; color:${FOREST}; border:2px solid ${FOREST}; text-decoration:none; font-weight:700; font-size:16px; border-radius:999px; padding:0 24px; margin:0 0 14px; }
  .small { font-size:13.5px; line-height:1.5; margin:0; }
  .small a { color:${MOSS}; font-weight:700; display:inline-flex; align-items:center; min-height:44px; }
</style>
</head><body>
  <header class="head">
    <div class="head-in">
      <img class="logo" src="${LOGO}" width="118" alt="Kya &amp; Co." />
      <h1>Open Google Play</h1>
      <p class="line">TikTok's browser can't install apps. Tap below to get Kya &amp; Co. in the Play Store app.</p>
    </div>
  </header>
  <main class="body">
    <div class="card">
      <a class="cta" href="${attr(app)}" data-tap="${attr(tapApp)}">Open in Google Play</a>
      <p class="small">Nothing happening? Tap the menu at the top and choose Open in browser, or <a href="${attr(web)}" data-tap="${attr(tapWeb)}">open the Play Store page</a>.</p>
    </div>
  </main>
<script>
  document.querySelectorAll("a[data-tap]").forEach(function (a) {
    a.addEventListener("click", function () {
      try { fetch(a.getAttribute("data-tap"), { keepalive: true }); } catch (e) {}
    });
  });
</script>
</body></html>`;
}
