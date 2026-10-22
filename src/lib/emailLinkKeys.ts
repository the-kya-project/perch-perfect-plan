/**
 * Keys for the signed links inside emails: unsubscribe, weight-chart images,
 * click tracking (/r/) and the bereavement review links.
 *
 * These used to share CARE_PLAN_REMINDER_SECRET with the cron hooks' bearer
 * auth, so rotating the cron token would have broken every link in every email
 * already sent (an unsubscribe link that stops working is worse than none).
 * Now the two purposes are separate:
 *   - EMAIL_LINK_SECRET signs every new link and verifies it.
 *   - EMAIL_LINK_LEGACY_SECRET holds the old CARE_PLAN_REMINDER_SECRET value,
 *     so links in emails sent before the split keep working. It is accepted
 *     for verification only, and only until LEGACY_LINK_KEY_UNTIL; after that
 *     date it is ignored even if still set, and can be deleted.
 *   - CARE_PLAN_REMINDER_SECRET is cron/hook authentication only, and can be
 *     rotated without touching any link.
 * All three are Production-only in Vercel; previews have none, so they send no
 * email and treat every link as invalid.
 *
 * Signing never falls back to the legacy key: a missing EMAIL_LINK_SECRET
 * throws, the same way the old secret did. Verification never throws; with no
 * usable key every link is simply invalid ("Not found").
 *
 * Isomorphic on purpose (no node: imports): emailClicks.server is reachable
 * from files that are also bundled for the browser.
 */

/** 90 days after the split (2026-10-22). Old links stop verifying after this. */
export const LEGACY_LINK_KEY_UNTIL = Date.parse("2027-01-20T00:00:00Z");

type Env = Record<string, string | undefined>;
function env(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {};
}

/** The key that signs new links. Throws when it isn't configured. */
export function linkSigningKey(what: string): string {
  const s = env().EMAIL_LINK_SECRET;
  if (!s) throw new Error(`EMAIL_LINK_SECRET is required to sign ${what}`);
  return s;
}

/** Every key a link may have been signed with, current first. Empty when none
 *  is configured. The legacy key drops out on LEGACY_LINK_KEY_UNTIL. */
export function linkVerifyingKeys(now: number = Date.now()): string[] {
  const e = env();
  const keys: string[] = [];
  if (e.EMAIL_LINK_SECRET) keys.push(e.EMAIL_LINK_SECRET);
  const legacy = e.EMAIL_LINK_LEGACY_SECRET;
  if (legacy && now < LEGACY_LINK_KEY_UNTIL && legacy !== e.EMAIL_LINK_SECRET) keys.push(legacy);
  return keys;
}

/** Constant-time string compare, so a signature can't be guessed byte by byte. */
export function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
