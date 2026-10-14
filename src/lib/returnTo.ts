/**
 * Where to land after signing in, when the reader arrived on a deep link (an
 * email's "Add your bird" button, the handoff email's Past birds link, …).
 *
 * The path travels as `/auth?redirect=…`. Email/password sign-in reads it
 * straight off the URL. Google and Apple can't carry it: the web flow
 * round-trips through the provider back to /welcome, and the native flow
 * pushes /welcome itself. So before either starts, the path is stashed here,
 * and /welcome picks it up and forwards there instead of the dashboard.
 *
 * The path keeps its query string — `/birds/new?next=weight` must arrive with
 * `next` intact, or the reader lands in the care-plan walkthrough instead of
 * the weight log the email was about.
 */

const KEY = "kya:returnTo";
/** Long enough for a slow OAuth round trip; short enough that an abandoned
 *  sign-in can't hijack a /welcome visit days later. */
const TTL_MS = 30 * 60 * 1000;

/** Only same-origin absolute paths ("/past-birds", "/birds/new?next=weight") —
 *  never protocol-relative ("//evil") or anything else, so `redirect` can't be
 *  used as an open redirect. */
export function safeInternalPath(p: string | undefined | null): string | null {
  if (!p || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\")) return null;
  return p;
}

export function stashReturnTo(path: string | null): void {
  const safe = safeInternalPath(path);
  try {
    if (!safe) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, JSON.stringify({ path: safe, at: Date.now() }));
  } catch { /* storage blocked: the reader lands on the dashboard, as before */ }
}

/** Read and clear. Returns null when nothing usable is stashed. */
export function takeReturnTo(): string | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    window.localStorage.removeItem(KEY);
    const { path, at } = JSON.parse(raw) as { path?: string; at?: number };
    if (typeof at !== "number" || Date.now() - at > TTL_MS) return null;
    return safeInternalPath(path);
  } catch {
    return null;
  }
}
