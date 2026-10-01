/**
 * The page a desktop visitor gets from /get-app or /review.
 *
 * Its only job is to move the link to a phone, so the QR is the point and the
 * badges are the fallback. Flock Club styling, hand-written rather than pulled
 * from the email shell: that shell builds a whole email document (preheader,
 * unsubscribe footer, disclaimer), none of which belongs on a web page.
 */
import qrcode from "qrcode-generator";
import { STORE, UTM_KEYS, withUtms, type Utms } from "./storeRedirect.server";

/** Where absolute URLs point when the caller does not say. */
const PROD_ORIGIN = "https://app.thekyaproject.com";

/**
 * The share image for link previews.
 *
 * NOTE: this is the 1960x600 brand lockup, the same asset __root.tsx already
 * uses. It is NOT a purpose-built 1200x630 (1.91:1) card, so Slack, Facebook
 * and iMessage will crop or letterbox it. Drop a real 1200x630 export in
 * public/brand/ and change this one line when there is one.
 */
const SHARE_IMAGE = "/brand/lockups/horizontal-ink.png";

/** Fallback QR asset, used for /review and if QR generation ever fails. */
const STATIC_QR = "/brand/store/get-app-qr.png";

const FOREST = "#1a3d2e";
const LIME = "#cdeab0";
const PAGE = "#e9e6dc";
const CARD = "#fbf9f3";
const MUTED = "#5f5e5a";
const BODY = "'DM Sans','Helvetica Neue',Helvetica,'Segoe UI',sans-serif";
const HEAD = "'Bricolage Grotesque','Avenir Next','Segoe UI',Helvetica,sans-serif";

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
 * format's capacity) falls back to the static asset rather than 500ing a page
 * whose whole job is to hand someone a link.
 */
function qrMarkup(target: string): string {
  try {
    const qr = qrcode(0, "M");
    qr.addData(target);
    qr.make();
    // scalable: the SVG carries a viewBox and sizes from CSS, so the .qr rule
    // below keeps controlling the rendered size.
    return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
  } catch {
    return `<img class="qr" src="${STATIC_QR}" width="200" height="200" alt="" />`;
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
  const blurb =
    kind === "get"
      ? "Scan the code with your phone's camera, or open the store you use."
      : "Reviews are written from the store app on your phone. Scan the code, or open the store you use.";
  // Back through the redirect rather than straight to the store, so a desktop
  // visitor who taps a badge is counted and attributed like everyone else.
  const ios = kind === "get" ? withUtms(`${basePath}?store=ios`, utms) : STORE.iosReview;
  const android = kind === "get" ? withUtms(`${basePath}?store=android`, utms) : STORE.androidReview;

  // The QR points back through this same entry path, carrying the UTMs plus
  // qr=1. /review keeps the static asset: its chooser is a different job and is
  // out of scope here.
  const utmQs = UTM_KEYS.filter((k) => utms[k])
    .map((k) => `${k}=${encodeURIComponent(utms[k]!)}`)
    .join("&");
  const qrTarget = `${origin}${basePath}?${utmQs ? `${utmQs}&` : ""}qr=1`;
  const qr =
    kind === "get"
      // data-qr-target states in the markup what the code actually encodes, so
      // "where does this QR go?" is answerable from view-source or a curl
      // rather than by pointing a phone at it.
      ? `<div class="qr" data-qr-target="${attr(qrTarget)}">${qrMarkup(qrTarget)}</div>`
      : `<img class="qr" src="${STATIC_QR}" width="200" height="200" alt="QR code linking to this page on your phone" />`;

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
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${attr(SHARE_TITLE)}" />
<meta name="twitter:description" content="${attr(SHARE_DESC)}" />
<meta name="twitter:image" content="${attr(`${origin}${SHARE_IMAGE}`)}" />`
      : "";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title.replace(/&amp;/g, "&")} — Kya &amp; Co.</title>${preview}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;800&family=DM+Sans:wght@400;700&display=swap" rel="stylesheet" />
<style>
  body { margin:0; background:${PAGE}; font-family:${BODY}; -webkit-text-size-adjust:100%; }
  .wrap { max-width:520px; margin:0 auto; padding:24px 16px 48px; }
  .card { background:${CARD}; border-radius:20px; overflow:hidden; }
  .bar { background:${FOREST}; padding:18px 22px; color:#fff; font-family:${HEAD}; font-weight:800; letter-spacing:-.3px; }
  .body { padding:24px 22px 28px; text-align:center; }
  h1 { margin:0 0 10px; font-family:${HEAD}; font-size:28px; line-height:34px; font-weight:800; letter-spacing:-.5px; color:${FOREST}; }
  p { margin:0 0 20px; font-size:15px; line-height:23px; color:${MUTED}; }
  .qr { width:200px; height:200px; display:block; margin:0 auto 22px; border-radius:12px; background:#fff; padding:10px; box-sizing:content-box; }
  /* The generated QR is an inline <svg> inside .qr — make it fill the box. */
  .qr svg { display:block; width:100%; height:100%; }
  .badges { display:flex; gap:12px; justify-content:center; flex-wrap:wrap; align-items:center; }
  .badges img { display:block; }
  .pill { display:inline-block; background:${LIME}; color:${FOREST}; border-radius:999px; padding:5px 13px; font-size:11.5px; font-weight:700; margin:0 0 14px; }
  @media (max-width:420px) { h1 { font-size:24px; line-height:30px; } }
</style>
</head><body>
  <div class="wrap">
    <div class="card">
      <div class="bar">Kya &amp; Co.</div>
      <div class="body">
        <span class="pill">On your phone</span>
        <h1>${title}</h1>
        <p>${blurb}</p>
        ${qr}
        <div class="badges">
          <a href="${ios}"><img src="/brand/store/app-store-badge.svg" width="120" height="40" alt="Download on the App Store" /></a>
          <a href="${android}"><img src="/brand/store/google-play-badge.png" width="103" height="40" alt="Get it on Google Play" /></a>
        </div>
      </div>
    </div>
  </div>
</body></html>`;
}
