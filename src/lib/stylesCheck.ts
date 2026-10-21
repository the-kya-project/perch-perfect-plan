// Did the app's stylesheet actually apply? On 2026-10-21 the installed iOS app
// ran the current code (data loaded, screens rendered) but with no styles at
// all, while Safari on the same phone was fine. This checks once after start-
// up, reports what the page and its service worker saw for the stylesheet (so
// the cause is visible in PostHog as `styles_missing`), then recovers with the
// one shared automatic hard reset (sw-register.ts). Never more than once.
import { recoverMissingStyles } from "@/lib/sw-register";

const CHECK_AFTER_MS = 3_000;
/** Time for the report to leave the device before the reset reloads. */
const SEND_BEFORE_RESET_MS = 2_500;

async function describeStylesheet(): Promise<Record<string, unknown>> {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    .filter((l) => (l.getAttribute("href") ?? "").includes("/assets/"));
  const out: Record<string, unknown> = {
    link_count: links.length,
    hrefs: links.map((l) => l.getAttribute("href")).join(" "),
    sheets: links.map((l) => { try { return l.sheet ? String(l.sheet.cssRules.length) : "no-sheet"; } catch (e) { return `err:${(e as Error).name}`; } }).join(" "),
    sw_controller: navigator.serviceWorker?.controller?.scriptURL ?? "none",
    ready_state: document.readyState,
  };
  const href = links[0]?.href;
  if (href) {
    try {
      const r = await fetch(href);
      const body = await r.text();
      Object.assign(out, { fetch_status: r.status, fetch_type: r.headers.get("content-type"), fetch_length: body.length, fetch_redirected: r.redirected, fetch_starts: body.slice(0, 40) });
    } catch (e) { out.fetch_error = (e as Error).message; }
    try {
      const hit = "caches" in window ? await caches.match(href) : undefined;
      out.cache_hit = !!hit;
      if (hit) Object.assign(out, { cache_status: hit.status, cache_type: hit.headers.get("content-type"), cache_length: (await hit.text()).length });
    } catch (e) { out.cache_error = (e as Error).message; }
    try { out.cache_names = (await caches.keys()).join(" "); } catch { /* ignore */ }
  }
  return out;
}

export function checkStylesApplied() {
  if (typeof window === "undefined") return;
  window.setTimeout(async () => {
    // --ink is defined on :root by styles.css; empty means it never applied.
    if (getComputedStyle(document.documentElement).getPropertyValue("--ink").trim()) return;
    const details = await describeStylesheet().catch((e) => ({ describe_error: String(e) }));
    const ph = (window as unknown as { posthog?: { capture?: (n: string, p: object, o?: object) => void } }).posthog;
    try { ph?.capture?.("styles_missing", details, { send_instantly: true }); } catch { /* ignore */ }
    window.setTimeout(() => { recoverMissingStyles(); }, SEND_BEFORE_RESET_MS);
  }, CHECK_AFTER_MS);
}
