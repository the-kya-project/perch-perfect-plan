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

// ── Status, refunds and money kept ─────────────────────────────────────────

export type GiftStatus = "paid" | "redeemed" | "refunded";

/**
 * LAUNCH RULE: only a gift whose status is 'redeemed' may ever grant
 * membership. A refunded gift keeps redeemed_by and redeemed_at, so "has a
 * redeemer" is not the test. Whatever turns redeemed gifts into entitlements at
 * launch must go through this (or private.gift_grants_membership(status) in
 * SQL, which says the same thing).
 */
export function giftGrantsMembership(gift: { status: string | null | undefined }): boolean {
  return gift.status === "redeemed";
}

export type GiftRefundState = { status: string; amountPaidCents: number; amountRefundedCents: number };

/**
 * What a Stripe charge.refunded event does to a gift. Stripe's
 * charge.amount_refunded is cumulative, so each event says how much has been
 * refunded in total. The amount only ever goes up (a late, older event can't
 * lower it) and never past what was paid. The gift becomes 'refunded' once the
 * refunds reach the amount paid: one full refund, or several partial ones that
 * add up. Until then it keeps its status and stays valid.
 */
export function applyGiftRefund(
  gift: GiftRefundState,
  charge: { amountRefundedCents: number; fullyRefunded: boolean },
): { status: string; amountRefundedCents: number; becameRefunded: boolean; changed: boolean } {
  const refunded = Math.min(Math.max(gift.amountRefundedCents, charge.amountRefundedCents, 0), gift.amountPaidCents);
  const full = gift.status === "refunded" || charge.fullyRefunded || (gift.amountPaidCents > 0 && refunded >= gift.amountPaidCents);
  const status = full ? "refunded" : gift.status;
  // A full refund refunds everything, whatever the amount said.
  const amountRefundedCents = full ? gift.amountPaidCents : refunded;
  return {
    status,
    amountRefundedCents,
    becameRefunded: full && gift.status !== "refunded",
    changed: status !== gift.status || amountRefundedCents !== gift.amountRefundedCents,
  };
}

/** What we kept from a gift: nothing once refunded, else paid minus partial refunds. */
export function giftKeptCents(gift: { status: string; amount_paid_cents: number; amount_refunded_cents?: number | null }): number {
  if (gift.status === "refunded") return 0;
  return Math.max(0, gift.amount_paid_cents - (gift.amount_refunded_cents ?? 0));
}

/** The rescue and conservation share of what we kept (20%, or 40% on double-giving days). */
export function giftGivingCents(gift: { status: string; amount_paid_cents: number; amount_refunded_cents?: number | null; giving_rate: number }): number {
  return Math.round(giftKeptCents(gift) * gift.giving_rate);
}
