// Startup safety net, inline in <head> so it works even when the app's own
// code never loads (a page whose scripts 404 can't run anything from the
// bundle, which is why the bundle-side recovery in sw-register.ts didn't help
// the 2026-10-21 stuck installs). Two jobs, no dependencies:
//  1. A code or style file of this page fails to load → ONE automatic hard
//     reset (unregister the worker, clear caches, reload). The attempt is
//     shared with sw-register.ts through the same "kya-auto-reload" record,
//     so the two together still reload at most once; after that, or offline,
//     it shows the screen below instead.
//  2. The app hasn't finished starting after 10 seconds → "Something's taking
//     too long" with a Try again button. Never an automatic reload.
// Leaving the page doesn't count as a failure: when a navigation starts
// (a tapped link, a redirect), Safari cancels the page's pending file loads
// and reports each as an error. Reloading then would replace the page the
// person asked for, so from beforeunload/pagehide until the page is shown
// again, load errors are ignored here and in sw-register.ts
// (window.__kyaLeaving).
// The app sets window.__kyaReady once the first screen has loaded (see
// RootComponent in __root.tsx), which also removes the screen if it's showing.
//
// It must be listening before any of the page's files can fail, so it's the
// first thing in <head>, right after the charset and before the code
// preloads, the font stylesheet and the ~110 KB of inlined styles. When it
// came after them, a file that failed at once could report before the guard
// was listening, and the reset never started (the flaky WebKit test,
// docs/flock/opening-scope.md B5). React can't put it there: it moves every
// <meta>, <link> and <title> ahead of a head script. So the server entry
// (src/server.ts) adds it to each page's HTML (withStartupGuard, below), and
// React never renders it; React leaves an extra script in <head> alone when
// hydrating. e2e/startup-guard.spec.ts checks the order in the served HTML.
//
// It also keeps a list of the page's code files (window.__kyaCode: every
// /assets/ script or preload that loaded or failed, and which failed), so the
// root error screen can tell a missing file from a real error
// (pageCodeFailed in sw-register.ts).
export const STARTUP_GUARD = `(function(){try{` +
  `var K="kya-auto-reload",W=300000,shown=false,leaving=false;` +
  `var C=window.__kyaCode={files:[],failed:[]};` +
  `function code(e){var el=e&&e.target;if(!el||(el.tagName!=="SCRIPT"&&el.tagName!=="LINK"))return"";var u=el.src||el.href||"";return u.indexOf(location.origin+"/assets/")===0?u:""}` +
  `function note(u,bad){try{if(C.files.indexOf(u)<0)C.files.push(u);if(bad&&C.failed.indexOf(u)<0)C.failed.push(u)}catch(x){}}` +
  `addEventListener("load",function(e){var u=code(e);if(u)note(u,false)},true);` +
  `addEventListener("beforeunload",function(){leaving=true});addEventListener("pagehide",function(){leaving=true});` +
  `addEventListener("pageshow",function(){leaving=false});window.__kyaLeaving=function(){return leaving};` +
  `function nl(){try{return /^nl/i.test(navigator.language||"")}catch(e){return false}}` +
  `function reset(){var done=function(){try{var u=new URL(location.href);u.searchParams.set("_r",String(Date.now()));location.replace(u.toString())}catch(e){location.reload()}};` +
  `var p=[];try{if(navigator.serviceWorker)p.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}))}catch(e){}` +
  `try{if(window.caches)p.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}))}catch(e){}` +
  `Promise.all(p).then(done,done);setTimeout(done,3000)}` +
  `function show(){if(shown||window.__kyaReady||!document.body)return;shown=true;var d=document.createElement("div");d.id="kya-startup-slow";d.setAttribute("role","alert");` +
  `d.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;background:#1a3d2e;color:#fff;font-family:'DM Sans',system-ui,-apple-system,sans-serif;padding:calc(env(safe-area-inset-top) + 24px) 28px calc(env(safe-area-inset-bottom) + 24px)";` +
  `var h=document.createElement("h1");h.textContent=nl()?"Dit duurt te lang":"Something's taking too long";h.style.cssText="margin:0;font:700 28px/1.2 Newsreader,Georgia,serif";` +
  `var t=document.createElement("p");t.textContent=nl()?"Controleer je verbinding en probeer het opnieuw.":"Check your connection, then try again.";t.style.cssText="margin:0;max-width:30ch;font-size:15px;line-height:1.5;color:#d6e8dc";` +
  `var b=document.createElement("button");b.type="button";b.textContent=nl()?"Opnieuw proberen":"Try again";b.style.cssText="margin-top:12px;min-height:52px;padding:0 32px;border-radius:999px;border:2px solid #1a3d2e;background:#f2b33d;color:#1a3d2e;font:700 16px 'DM Sans',system-ui,sans-serif";` +
  `b.onclick=function(){b.disabled=true;reset()};d.appendChild(h);d.appendChild(t);d.appendChild(b);document.body.appendChild(d)}` +
  `window.__kyaHideStartupGuard=function(){var d=document.getElementById("kya-startup-slow");if(d)d.remove()};` +
  `setTimeout(function(){if(!window.__kyaReady){if(document.body)show();else addEventListener("DOMContentLoaded",show)}},10000);` +
  `addEventListener("error",function(e){if(leaving)return;var u=code(e);if(!u)return;note(u,true);if(window.__kyaReady)return;` +
  `var at=0;try{at=Number(localStorage.getItem(K))||0}catch(x){}` +
  `if(navigator.onLine!==false&&!(Date.now()-at<W)){try{localStorage.setItem(K,String(Date.now()));reset();return}catch(x){}}` +
  `if(document.body)show();else addEventListener("DOMContentLoaded",show)},true);` +
  `}catch(e){}})();`;

const GUARD_TAG = `<script id="kya-startup-guard">${STARTUP_GUARD}</script>`;

/** Where the guard goes in a page's HTML: right after `<head>`, or after the
 *  charset when that comes first (it must stay in the page's first 1024
 *  bytes). Returns -1 when there's no `<head>` (yet). */
export function startupGuardInsertAt(html: string): number {
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (!head) return -1;
  let at = head.index + head[0].length;
  const charset = /^\s*<meta\s+charset=["']?utf-8["']?\s*\/?>/i.exec(html.slice(at));
  if (charset) at += charset[0].length;
  return at;
}

/** Is this the app's own page (its <head> loads the app's code)? The other
 *  HTML this server sends (unsubscribe, review and error pages) has no app to
 *  start, so the guard would only show "Something's taking too long" there. */
function isAppPage(head: string): boolean {
  return /<link[^>]*rel="modulepreload"|<script[^>]*type="module"/i.test(head);
}

/** Add the guard to a page's HTML (once), when it's the app's own page. Needs
 *  the whole <head>. */
export function insertStartupGuard(html: string): string {
  if (html.includes('id="kya-startup-guard"')) return html;
  const end = html.search(/<\/head>/i);
  const at = startupGuardInsertAt(html);
  if (at < 0 || end < 0 || !isAppPage(html.slice(at, end))) return html;
  return html.slice(0, at) + GUARD_TAG + html.slice(at);
}

/** The server entry's step: the app's pages get the guard as the first script
 *  in <head>. Pages stay streamed: only the start is held until `</head>` has
 *  arrived (React sends the whole head in its first flush). Anything that
 *  isn't HTML passes through untouched. */
export function withStartupGuard(response: Response): Response {
  const type = response.headers.get("content-type") ?? "";
  if (!type.toLowerCase().includes("text/html") || !response.body) return response;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  let done = false;
  // The head holds ~110 KB of inlined styles; past this, a page with no
  // </head> is passed on as it is.
  const LIMIT = 1024 * 1024;
  const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Still decoded after the insert, so a character split across chunks
      // isn't lost.
      const text = decoder.decode(chunk, { stream: true });
      if (done) { if (text) controller.enqueue(encoder.encode(text)); return; }
      pending += text;
      if (!/<\/head>/i.test(pending) && pending.length < LIMIT) return;
      controller.enqueue(encoder.encode(insertStartupGuard(pending)));
      pending = "";
      done = true;
    },
    flush(controller) {
      pending += decoder.decode();
      if (pending) controller.enqueue(encoder.encode(done ? pending : insertStartupGuard(pending)));
    },
  }));
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
