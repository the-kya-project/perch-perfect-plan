/**
 * Service-worker registration wrapper.
 *
 * Refuses to register in any non-production context: dev, Lovable preview
 * iframes, preview/staging hostnames, or when `?sw=off` is passed. In those
 * cases it actively unregisters any stale `/sw.js` so a previously-installed
 * worker can't keep serving cached HTML.
 *
 * Sitter pages work fine without the worker — they hit the network for fresh
 * data on every navigation (denylisted in workbox config). Installation only
 * makes sense for owners using the app repeatedly.
 */
const SW_URL = "/sw.js";

function isPreviewHost(host: string): boolean {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  );
}

async function unregisterAppWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
      if (url.endsWith(SW_URL)) await r.unregister();
    }
  } catch { /* ignore */ }
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const url = new URL(window.location.href);
  const refuse =
    !import.meta.env.PROD ||
    inIframe ||
    isPreviewHost(window.location.hostname) ||
    url.searchParams.get("sw") === "off";

  if (refuse) {
    void unregisterAppWorkers();
    return;
  }

  // Register after load so it never competes with first paint.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => { /* swallow */ });
  });
}
