/**
 * Flock billing (backlog 1.14): the rules, with nothing that talks to Stripe or
 * the database, so `npm run test:billing` can pin them. Spec:
 * docs/flock/payments-plan.md sections c and d.
 *
 * Switched off: everything that uses these checks BILLING_ENABLED first, and it
 * stays off until Brittany turns it on in Vercel. Test mode only for now
 * (stripe.server.ts, getBillingStripe).
 */

/** Paid Flock plans, as stored in entitlements.plan for a Stripe row. */
export type PaidPlan = "founding" | "monthly" | "annual";
/** What a member who isn't a founder picks on the card step. */
export const BILLING_CHOICES = ["monthly", "annual"] as const;
export type BillingChoice = (typeof BILLING_CHOICES)[number];

export type EntitlementStatus = "active" | "trialing" | "past_due" | "canceled";

/** Stripe price ids for each plan (Vercel: STRIPE_PRICE_FLOCK_FOUNDING,
 *  STRIPE_PRICE_FLOCK_MONTHLY, STRIPE_PRICE_FLOCK_YEARLY). */
export type BillingPrices = Partial<Record<PaidPlan, string>>;

/** The switch. Only the exact value "true" turns billing on; anything else,
 *  including unset, is off. */
export function billingEnabled(value: string | undefined | null): boolean {
  return value === "true";
}

/** A paid row's plan comes from its price, never from metadata. */
export function planForPrice(priceId: string | null | undefined, prices: BillingPrices): PaidPlan | null {
  if (!priceId) return null;
  for (const plan of ["founding", "monthly", "annual"] as const) {
    if (prices[plan] && prices[plan] === priceId) return plan;
  }
  return null;
}

/**
 * Stripe's subscription status → ours. is_flock_member() gives access for
 * active/trialing, and for past_due/canceled until current_period_end.
 *   incomplete: the first payment hasn't gone through, so no row yet (null).
 *   unpaid: Stripe has stopped retrying; access runs out with the period.
 *   paused / incomplete_expired: ended.
 */
export function entitlementStatus(stripeStatus: string): EntitlementStatus | null {
  switch (stripeStatus) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due":
    case "unpaid": return "past_due";
    case "canceled":
    case "incomplete_expired":
    case "paused": return "canceled";
    default: return null;
  }
}

/** The parts of a Stripe subscription the webhook reads. Since API version
 *  2025-03-31 the billing period lives on each item, not the subscription. */
export type SubscriptionLike = {
  id: string;
  status: string;
  customer: string | { id: string };
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  trial_end?: number | null;
  ended_at?: number | null;
  canceled_at?: number | null;
  metadata?: Record<string, string> | null;
  items: { data: { current_period_end?: number | null; price: { id: string; product: string | { id: string } } }[] };
};

export type SubscriptionRow = {
  customerId: string;
  subscriptionId: string;
  plan: PaidPlan;
  status: EntitlementStatus;
  productId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  willRenew: boolean;
};

const iso = (unix: number | null | undefined) => (unix ? new Date(unix * 1000).toISOString() : null);

/**
 * What a subscription's entitlement row should say, read fresh from Stripe.
 * Access runs to:
 *   trialing → the trial's end (the free season's end, for a card added during it);
 *   canceled → when it ended (so access stops now);
 *   otherwise → the end of the paid period.
 */
export function subscriptionRow(
  sub: SubscriptionLike,
  prices: BillingPrices,
  now: Date = new Date(),
): { ok: true; row: SubscriptionRow } | { ok: false; why: string } {
  const item = sub.items?.data?.[0];
  if (!item) return { ok: false, why: "subscription has no items" };
  if ((sub.items.data ?? []).length > 1) return { ok: false, why: "subscription has more than one item" };
  const plan = planForPrice(item.price?.id, prices);
  if (!plan) return { ok: false, why: "price isn't a Flock plan" };
  const status = entitlementStatus(sub.status);
  if (!status) return { ok: false, why: `status ${sub.status}` };
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return { ok: false, why: "no customer" };
  const product = item.price.product;
  const productId = typeof product === "string" ? product : product?.id ?? null;

  let end: string | null;
  if (status === "canceled") end = iso(sub.ended_at) ?? iso(sub.canceled_at) ?? now.toISOString();
  else if (status === "trialing" && sub.trial_end) end = iso(sub.trial_end);
  else end = iso(item.current_period_end) ?? iso(sub.trial_end);

  const cancelAtPeriodEnd = !!sub.cancel_at_period_end;
  const willRenew = status !== "canceled" && !cancelAtPeriodEnd && !sub.cancel_at;
  return {
    ok: true,
    row: { customerId, subscriptionId: sub.id, plan, status, productId, currentPeriodEnd: end, cancelAtPeriodEnd, willRenew },
  };
}

/** Stripe Checkout needs a trial to end at least 48 hours ahead; we keep an
 *  hour more so a slow click can't land inside the limit. */
export const MIN_TRIAL_LEAD_MS = 49 * 60 * 60 * 1000;

/**
 * When the first charge happens for a card added now.
 *   - No free-season end stored yet: the card step can't open (no date to
 *     bill from, and no date may be invented).
 *   - The end is comfortably ahead: a trial to exactly that moment, $0 today.
 *   - Otherwise (the season has ended or is about to): no trial, charged today.
 */
export function firstCharge(
  seasonEndsAt: string | null | undefined,
  now: Date = new Date(),
): { ok: false; reason: "no_season_end" } | { ok: true; trialEnd: number | null; firstChargeOn: string } {
  if (!seasonEndsAt) return { ok: false, reason: "no_season_end" };
  const end = new Date(seasonEndsAt);
  if (Number.isNaN(end.getTime())) return { ok: false, reason: "no_season_end" };
  if (end.getTime() - now.getTime() >= MIN_TRIAL_LEAD_MS) {
    return { ok: true, trialEnd: Math.floor(end.getTime() / 1000), firstChargeOn: end.toISOString() };
  }
  return { ok: true, trialEnd: null, firstChargeOn: now.toISOString() };
}

/** Which price a member gets: a founder whose claim is neither released nor
 *  forfeited always gets the founding price (there's no yearly founding
 *  option); everyone else gets what they picked. */
export function checkoutPlan(choice: BillingChoice, foundingPriceOpen: boolean): PaidPlan {
  return foundingPriceOpen ? "founding" : choice;
}

/** A Stripe row that still counts: anything but an ended one. */
export function liveSubscription<T extends { status: string; current_period_end: string | null }>(
  rows: T[],
  now: Date = new Date(),
): T | null {
  const t = now.getTime();
  return (
    rows.find((r) => r.status !== "canceled" && !(r.status === "past_due" && r.current_period_end && new Date(r.current_period_end).getTime() <= t))
    ?? null
  );
}

/** What the card step on Membership shows. */
export type CardStep =
  | { kind: "hidden" }
  | { kind: "not_ready" }
  | { kind: "choose"; founding: boolean; firstChargeOn: string; chargedToday: boolean }
  | { kind: "on_file"; plan: PaidPlan; status: EntitlementStatus; firstChargeOn: string | null; willRenew: boolean };

export type BillingState =
  | { enabled: false }
  | {
      enabled: true;
      seasonEndsAt: string | null;
      foundingPriceOpen: boolean;
      prices: Partial<Record<PaidPlan, number>>;
      subscription: { plan: PaidPlan; status: EntitlementStatus; current_period_end: string | null; will_renew: boolean | null } | null;
    };

/** Never in the native app (payments-plan section b: the app's paywall is
 *  in-app purchase, built later); hidden whenever billing is off. */
export function cardStep(state: BillingState | undefined, native: boolean, now: Date = new Date()): CardStep {
  if (!state || !state.enabled || native) return { kind: "hidden" };
  const sub = state.subscription;
  if (sub) {
    const first = sub.status === "trialing" ? sub.current_period_end : null;
    return { kind: "on_file", plan: sub.plan, status: sub.status, firstChargeOn: first, willRenew: sub.will_renew !== false };
  }
  const fc = firstCharge(state.seasonEndsAt, now);
  if (!fc.ok) return { kind: "not_ready" };
  return { kind: "choose", founding: state.foundingPriceOpen, firstChargeOn: fc.firstChargeOn, chargedToday: fc.trialEnd === null };
}
