// Is the sitter view being shown as an owner preview rather than to a real
// sitter? Owner previews ("See what [sitter] sees", "View as sitter", the
// setup preview) always render the sitter view inside an iframe, and open it
// with ?preview=1. A real sitter opens their link directly. In a preview,
// nothing may be saved or counted: no task ticks, health checks, reminder
// pauses or visit analytics.
export function isOwnerPreview(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true; // a cross-origin parent: treat as framed
  }
  return new URLSearchParams(window.location.search).get("preview") === "1";
}
