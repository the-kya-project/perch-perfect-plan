/**
 * The page a desktop visitor gets from /get-app or /review.
 *
 * Its only job is to move the link to a phone, so the QR is the point and the
 * badges are the fallback. Flock Club styling, hand-written rather than pulled
 * from the email shell: that shell builds a whole email document (preheader,
 * unsubscribe footer, disclaimer), none of which belongs on a web page.
 */
import { STORE, withUtms, type Utms } from "./storeRedirect.server";

const FOREST = "#1a3d2e";
const LIME = "#cdeab0";
const PAGE = "#e9e6dc";
const CARD = "#fbf9f3";
const MUTED = "#5f5e5a";
const BODY = "'DM Sans','Helvetica Neue',Helvetica,'Segoe UI',sans-serif";
const HEAD = "'Bricolage Grotesque','Avenir Next','Segoe UI',Helvetica,sans-serif";

/**
 * `basePath` is the entry point the visitor actually used — /get or /get-app.
 * The badges go back through that same path so a desktop visitor who taps one
 * is counted under the link they really followed. Defaults to /get-app, which
 * is what the launch email's links use.
 */
export function chooserPage(
  kind: "get" | "review",
  utms: Utms = {},
  basePath: "/get" | "/get-app" = "/get-app",
): string {
  const title = kind === "get" ? "Get Kya &amp; Co. on your phone" : "Leave a review from your phone";
  const blurb =
    kind === "get"
      ? "Scan the code with your phone's camera, or open the store you use."
      : "Reviews are written from the store app on your phone. Scan the code, or open the store you use.";
  // Back through the redirect rather than straight to the store, so a desktop
  // visitor who taps a badge is counted and attributed like everyone else.
  const ios = kind === "get" ? withUtms(`${basePath}?store=ios`, utms) : STORE.iosReview;
  const android = kind === "get" ? withUtms(`${basePath}?store=android`, utms) : STORE.androidReview;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${title.replace(/&amp;/g, "&")} — Kya &amp; Co.</title>
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
        <img class="qr" src="/brand/store/get-app-qr.png" width="200" height="200" alt="QR code linking to this page on your phone" />
        <div class="badges">
          <a href="${ios}"><img src="/brand/store/app-store-badge.svg" width="120" height="40" alt="Download on the App Store" /></a>
          <a href="${android}"><img src="/brand/store/google-play-badge.png" width="103" height="40" alt="Get it on Google Play" /></a>
        </div>
      </div>
    </div>
  </div>
</body></html>`;
}
