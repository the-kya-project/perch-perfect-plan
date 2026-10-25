// Shared by every "send the confirmation email again" button: /confirm-email,
// the "You already have an account" card on /auth, and /link-expired.
//
// 60s, not 30: each resend replaces the previous link, and emails to iCloud in
// particular can take a while, so quick repeat requests mostly produce links
// that are dead by the time they arrive.
export const CONFIRM_RESEND_COOLDOWN_S = 60;

/** Where a confirmed owner lands (the same redirect sign-up uses). */
export function confirmRedirectTo(): string {
  return window.location.origin + "/welcome";
}

// Hand-off from /link-expired to /auth when the account turns out to be
// confirmed already: the email to pre-fill and a one-line reason. Kept in
// sessionStorage (personal data stays out of the URL) and read once, after
// mount, so the server render and the first browser render agree.
const SIGNIN_PREFILL_KEY = "kya_signin_prefill";

export function stashSignInPrefill(email: string): void {
  try { window.sessionStorage.setItem(SIGNIN_PREFILL_KEY, JSON.stringify({ email, reason: "confirmed" })); } catch { /* storage blocked */ }
}

export function takeSignInPrefill(): { email: string; reason: "confirmed" } | null {
  try {
    const raw = window.sessionStorage.getItem(SIGNIN_PREFILL_KEY);
    window.sessionStorage.removeItem(SIGNIN_PREFILL_KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.email === "string" ? { email: v.email, reason: "confirmed" } : null;
  } catch {
    return null;
  }
}
