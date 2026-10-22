// Signed, login-free unsubscribe links.
//
// A mail client has no session, and a reader who wants out should not have to
// remember a password to get out. So the link carries the account id, the
// category, and an HMAC over both — and nothing else. No email address in the
// URL: those get logged by proxies, forwarded, and pasted into tickets.
//
// The signature has no expiry on purpose. An unsubscribe link that stops
// working is worse than useless: the reader clicks it, nothing happens, and
// the next email arrives anyway. So the key is EMAIL_LINK_SECRET, separate from
// the cron token, and links signed before the split stay valid through
// EMAIL_LINK_LEGACY_SECRET until its cutoff (see emailLinkKeys.ts).
import { createHmac } from "node:crypto";
import { linkSigningKey, linkVerifyingKeys, sameString } from "./emailLinkKeys";

/** The two things a reader can turn off. Everything else is transactional and
 *  cannot be unsubscribed from here — see the migration comment. */
export const UNSUB_CATEGORIES = ["monthly", "onboarding"] as const;
export type UnsubCategory = (typeof UNSUB_CATEGORIES)[number];

/** Which profiles column each category writes. */
export const UNSUB_COLUMN: Record<UnsubCategory, string> = {
  monthly: "notify_monthly_letter",
  onboarding: "notify_onboarding",
};

export function isUnsubCategory(v: string): v is UnsubCategory {
  return (UNSUB_CATEGORIES as readonly string[]).includes(v);
}

function sigWith(key: string, userId: string, category: UnsubCategory): string {
  return createHmac("sha256", key).update(`unsub:${userId}:${category}`).digest("hex").slice(0, 32);
}

export function unsubSig(userId: string, category: UnsubCategory): string {
  return sigWith(linkSigningKey("unsubscribe links"), userId, category);
}

export function unsubSigValid(userId: string, category: UnsubCategory, sig: string): boolean {
  return linkVerifyingKeys().some((k) => sameString(sigWith(k, userId, category), sig));
}

/** `{base}/api/public/unsubscribe/{category}/{userId}/{sig}` */
export function unsubUrl(base: string, userId: string, category: UnsubCategory): string {
  return `${base}/api/public/unsubscribe/${category}/${userId}/${unsubSig(userId, category)}`;
}

/** The two headers that give Gmail and Apple Mail their own unsubscribe button.
 *  List-Unsubscribe-Post is what makes it ONE click rather than a trip to a
 *  web page — the client POSTs for the reader. */
export function unsubHeaders(base: string, userId: string, category: UnsubCategory): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubUrl(base, userId, category)}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
