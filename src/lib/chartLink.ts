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
import { createHmac } from "node:crypto";

export const CHART_DEMO_ID = "demo";

function secret(): string {
  const s = process.env.CARE_PLAN_REMINDER_SECRET;
  if (!s) throw new Error("CARE_PLAN_REMINDER_SECRET is required to sign chart URLs");
  return s;
}

export function chartSig(birdId: string, month: string): string {
  return createHmac("sha256", secret()).update(`${birdId}:${month}`).digest("hex").slice(0, 24);
}

export function chartSigValid(birdId: string, month: string, sig: string): boolean {
  const want = chartSig(birdId, month);
  // Length-equal compare; the values are short and public-ish, but there is no
  // reason to leak timing.
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

/** `{base}/api/public/chart/{birdId}/{YYYY-MM}/{sig}` */
export function chartUrl(base: string, birdId: string, year: number, month: number): string {
  const m = `${year}-${String(month).padStart(2, "0")}`;
  return `${base}/api/public/chart/${birdId}/${m}/${chartSig(birdId, m)}`;
}
