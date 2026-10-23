// Gift memberships: shared constants and helpers for the /gift, /gift/thanks,
// /redeem and /admin/gifts pages, the server functions and the webhook.
//
// Prices are NOT here. They come from Stripe (the price ids are environment
// variables, see stripe.server.ts), so test and live can differ without a code
// change. What lives here is everything that isn't money.

export const GIFT_PLANS = ["flock_year", "app_premium_year"] as const;
export type GiftPlan = (typeof GIFT_PLANS)[number];

export function isGiftPlan(v: unknown): v is GiftPlan {
  return typeof v === "string" && (GIFT_PLANS as readonly string[]).includes(v);
}

/** Dated gift emails can be scheduled through this day (inclusive). */
export const GIFT_SEND_LAST_DATE = "2026-12-31";

/** Gift dates and the giving rate are judged in Indianapolis time, like the
 *  Founding 50 deadline. */
export const GIFT_TIME_ZONE = "America/Indiana/Indianapolis";

export const GIFT_MESSAGE_MAX = 300;
export const GIFT_NAME_MAX = 80;

/** Today's date (YYYY-MM-DD) in Indianapolis. */
export function giftToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: GIFT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** A date the buyer may pick for the recipient's email: today through the
 *  last send date. Plain string comparison works on YYYY-MM-DD. */
export function isAllowedSendDate(date: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return date >= giftToday(now) && date <= GIFT_SEND_LAST_DATE;
}

/** "Dec 24, 2026" for a YYYY-MM-DD date, without shifting it a day through UTC. */
export function formatGiftDate(date: string, locale = "en-US"): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/** "$300" or "$79.50". */
export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** The gift code alphabet: 2-9 and A-Z without I and O, so nothing can be read
 *  as 0/O or 1/I. Must match private.new_gift_code() and the table's check. */
export const GIFT_CODE_PATTERN = /^KYA-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
