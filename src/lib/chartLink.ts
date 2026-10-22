// Signed URLs for the weight-chart images.
//
// The chart renders when the mail client asks for it, not when the email is
// built, so nothing has to be stored and nothing has to be cleaned up. The URL
// carries only a bird id, a month, and a signature — never the weights
// themselves, which would otherwise sit in a query string that Gmail's image
// proxy fetches and logs.
//
// The signature stops the endpoint being enumerable: without it you would be
// able to walk bird ids and read any flock's numbers.
//
// Signed with EMAIL_LINK_SECRET; charts in emails sent before that key existed
// still verify through EMAIL_LINK_LEGACY_SECRET until its cutoff
// (emailLinkKeys.ts).
import { createHmac } from "node:crypto";
import { linkSigningKey, linkVerifyingKeys, sameString } from "./emailLinkKeys";

export const CHART_DEMO_ID = "demo";

function sigWith(key: string, birdId: string, month: string): string {
  return createHmac("sha256", key).update(`${birdId}:${month}`).digest("hex").slice(0, 24);
}

export function chartSig(birdId: string, month: string): string {
  return sigWith(linkSigningKey("chart URLs"), birdId, month);
}

export function chartSigValid(birdId: string, month: string, sig: string): boolean {
  // Constant-time compare; the values are short and public-ish, but there is
  // no reason to leak timing.
  return linkVerifyingKeys().some((k) => sameString(sigWith(k, birdId, month), sig));
}

/** `{base}/api/public/chart/{birdId}/{YYYY-MM}/{sig}` */
export function chartUrl(base: string, birdId: string, year: number, month: number): string {
  const m = `${year}-${String(month).padStart(2, "0")}`;
  return `${base}/api/public/chart/${birdId}/${m}/${chartSig(birdId, m)}`;
}
