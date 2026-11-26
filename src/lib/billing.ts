/**
 * Flock billing (backlog 1.14): the rules, with nothing that talks to Stripe or
 * the database, so `npm run test:billing` can pin them. Spec:
 * docs/flock/payments-plan.md sections c and d.
 *
 * Switched off: everything that uses these checks BILLING_ENABLED first, and it
 * stays off until Brittany turns it on in Vercel. Test mode only for now
 * (stripe.server.ts, getBillingStripe).
 */

/** Paid Flock plans, as stored in entitlements.plan for a Stripe row. Kya's
 *  Crew (backlog 1.15) is a Flock plan too. */
export type PaidPlan = "founding" | "monthly" | "annual" | "crew_monthly" | "crew_annual";
export const PAID_PLANS = ["founding", "monthly", "annual", "crew_monthly", "crew_annual"] as const satisfies readonly PaidPlan[];
/** The Flock membership tiles a member who isn't a founder picks from. */
export const BILLING_CHOICES = ["monthly", "annual"] as const;
export type BillingChoice = (typeof BILLING_CHOICES)[number];

/** Kya's Crew: $45 a month or $444 a year (prices come from Stripe). The card
 *  step offers it under the Flock tiles when its prices are set (backlog 1.15a). */
export const CREW_CHOICES = ["crew_monthly", "crew_annual"] as const;
export type CrewChoice = (typeof CREW_CHOICES)[number];
export const CHECKOUT_CHOICES = [...BILLING_CHOICES, ...CREW_CHOICES] as const;
export type CheckoutChoice = (typeof CHECKOUT_CHOICES)[number];

export function isCrewPlan(plan: string | null | undefined): plan is CrewChoice {
  return plan === "crew_monthly" || plan === "crew_annual";
}

/** The share of what a member pays that goes to rescue and conservation
 *  partners: 25% for Kya's Crew, 20% for every other membership. The database
 *  records the same on each row (private.membership_giving_rate). */
export function givingRate(plan: PaidPlan): number {
  return isCrewPlan(plan) ? 0.25 : 0.2;
}

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
  for (const plan of PAID_PLANS) {
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
  /** Discounts on the subscription (ids, or objects when expanded). */
  discounts?: (string | { id: string })[] | null;
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

/** A subscription started in Checkout needs its trial to end at least 48 hours
 *  ahead; we keep an hour more so a slow click can't land inside the limit.
 *  Closer to the season's end, Checkout only saves the card (saveCardFirst). */
export const MIN_TRIAL_LEAD_MS = 49 * 60 * 60 * 1000;

/**
 * When the first charge happens for a card added now.
 *   - No free-season end stored yet: the card step can't open (no date to
 *     bill from, and no date may be invented).
 *   - The end is comfortably ahead: a trial to exactly that moment, $0 today.
 *   - The end is under 49 hours away: still $0 today and the same first charge.
 *     Checkout saves the card, and the webhook starts the subscription.
 *   - The season has ended: no trial, charged today.
 */
export function firstCharge(
  seasonEndsAt: string | null | undefined,
  now: Date = new Date(),
): { ok: false; reason: "no_season_end" } | { ok: true; trialEnd: number | null; firstChargeOn: string; saveCardFirst: boolean } {
  if (!seasonEndsAt) return { ok: false, reason: "no_season_end" };
  const end = new Date(seasonEndsAt);
  if (Number.isNaN(end.getTime())) return { ok: false, reason: "no_season_end" };
  const lead = end.getTime() - now.getTime();
  if (lead > 0) {
    return { ok: true, trialEnd: Math.floor(end.getTime() / 1000), firstChargeOn: end.toISOString(), saveCardFirst: lead < MIN_TRIAL_LEAD_MS };
  }
  return { ok: true, trialEnd: null, firstChargeOn: now.toISOString(), saveCardFirst: false };
}

/** Which price a member gets: a founder whose claim is neither released nor
 *  forfeited gets the founding price for the Flock (there's no yearly founding
 *  option); everyone else gets what they picked. Kya's Crew is its own plan,
 *  so a founder who picks it gets Crew, and their claim is left as it is. */
export function checkoutPlan(choice: CheckoutChoice, foundingPriceOpen: boolean): PaidPlan {
  if (isCrewPlan(choice)) return choice;
  return foundingPriceOpen ? "founding" : choice;
}

/**
 * Promotion codes (backlog 1.17; Brittany, Nov 22, 2026): they apply to the
 * regular Flock plans and Kya's Crew, never to the founding price. Checkout
 * shows its "Add promotion code" field only when this is true, and the webhook
 * takes off any discount that reaches a founding subscription another way
 * (the Customer Portal, the Dashboard, the customer).
 *
 * A code stacks with a trial: the trial runs first and the code applies to the
 * paid invoices after it (Stripe's own order; nothing here changes it).
 */
export function promotionCodesAllowed(plan: PaidPlan): boolean {
  return plan !== "founding";
}

/** The discounts a founding subscription mustn't have; empty for every
 *  other plan. */
export function discountsToRemove(plan: PaidPlan, sub: Pick<SubscriptionLike, "discounts">): string[] {
  if (promotionCodesAllowed(plan)) return [];
  return (sub.discounts ?? []).map((d) => (typeof d === "string" ? d : d.id)).filter(Boolean);
}

/** Kya's Crew has no trial (payments-plan pricing answer 7): once the free
 *  season is over it's charged the day the card goes on. During the free
 *  season it's $0 until the season's end like every membership, because the
 *  Flock is free for everyone until then. The 14-day trial (payments build
 *  6f, not built yet) must skip the plans this returns false for. */
export function planGetsTrial(plan: PaidPlan): boolean {
  return plan !== "founding" && !isCrewPlan(plan);
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
      /** The founder's spot number, for the Founding 50 line. */
      foundingSpot: number | null;
      /** card_last4 is read from Stripe when the page loads and is never stored. */
      subscription: { plan: PaidPlan; status: EntitlementStatus; current_period_end: string | null; will_renew: boolean | null; card_last4: string | null } | null;
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

// ── The card step and checkout design (backlog 1.14a) ───────────────────────

/** How long the confirming screen waits for the webhook before saying so. */
export const CONFIRM_WAIT_MS = 2 * 60 * 1000;

/** Billing dates, on the Flock's calendar (Eastern), so the app and Checkout
 *  always name the same day. */
export function billingDay(iso: string, locale: BillingLocale = "en"): string {
  return new Date(iso).toLocaleDateString(locale === "nl" ? "nl-NL" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

/** The yearly plan's price per month, for the big number on its tile. */
export function yearlyPerMonthCents(annualCents: number): number {
  return Math.round(annualCents / 12);
}

/** Whole months the yearly plan saves. Null unless it's exact, so the
 *  "2 months free" badge can't outlive a price change. */
export function monthsFree(annualCents: number, monthlyCents: number): number | null {
  if (monthlyCents <= 0) return null;
  const months = (monthlyCents * 12 - annualCents) / monthlyCents;
  return Number.isInteger(months) && months > 0 ? months : null;
}

/** What Crew yearly saves on twelve months of Crew monthly, for its "Save"
 *  badge. Null when it saves nothing. */
export function yearlySavingCents(annualCents: number, monthlyCents: number): number | null {
  const saving = monthlyCents * 12 - annualCents;
  return monthlyCents > 0 && saving > 0 ? saving : null;
}

export type BillingScreen = "season_member" | "season_founder" | "after_season" | "confirming" | "welcome" | "membership" | "past_due";

/** Which billing screen shows. `returned` means just back from Checkout. */
export function billingScreen(step: Exclude<CardStep, { kind: "hidden" | "not_ready" }>, returned: boolean): BillingScreen {
  if (step.kind === "choose") {
    if (returned) return "confirming";
    if (step.chargedToday) return "after_season";
    return step.founding ? "season_founder" : "season_member";
  }
  if (step.status === "past_due") return "past_due";
  // "You're all set" is about the free season, so it needs a first charge ahead.
  return returned && step.status === "trialing" && step.firstChargeOn && step.willRenew ? "welcome" : "membership";
}

/** The line above Checkout's button. Stripe needs it as text, so it's English
 *  until the Dutch is approved; the key keeps it in en.jsonc. */
/** Stripe's page language and ours. */
export type BillingLocale = "en" | "nl";
/** Translates a sentence on the server; English when none is passed. */
export type NoteT = (key: string, text: string, v: Record<string, string>) => string;
const plainNote: NoteT = (_key, text, v) => Object.entries(v).reduce((s, [k, x]) => s.replaceAll(`{{${k}}}`, x), text);

export function checkoutNote(date: string, t: NoteT = plainNote): string {
  return t("flock.billing.checkoutNote", "You won't be charged until {{date}}. Cancel anytime before then from Membership and billing.", { date });
}

/** The same line when Checkout only saves the card. Stripe shows no plan or
 *  price on that page, so the sentence has to say what will be charged. */
export function saveCardNote(plan: PaidPlan, price: string, date: string, t: NoteT = plainNote): string {
  if (isCrewPlan(plan)) {
    return plan === "crew_annual"
      ? t("flock.billing.saveCardNoteCrewYearly", "Kya's Crew, {{price}} a year. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing.", { price, date })
      : t("flock.billing.saveCardNoteCrewMonthly", "Kya's Crew, {{price}} a month. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing.", { price, date });
  }
  return plan === "annual"
    ? t("flock.billing.saveCardNoteYearly", "The Flock, {{price}} a year. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing.", { price, date })
    : t("flock.billing.saveCardNoteMonthly", "The Flock, {{price}} a month. You won't be charged until {{date}}. Cancel anytime before then from Membership and billing.", { price, date });
}

/** When a save-the-card Checkout closes: at the season's end, within the 30
 *  minutes to 24 hours Stripe allows. */
export function saveCardExpiry(trialEnd: number, now: Date = new Date()): number {
  const t = Math.floor(now.getTime() / 1000);
  return Math.max(t + 31 * 60, Math.min(trialEnd, t + 23 * 60 * 60));
}

/** Per-session branding, so nothing is changed in the Stripe Dashboard. The
 *  logo is a fixed production URL because Stripe can't fetch a protected
 *  preview. DM Sans isn't one of Stripe's fonts; Inter is the closest. */
export function checkoutDesign(trialEnd: number | null, note?: string, locale: BillingLocale = "en") {
  return {
    locale,
    branding_settings: {
      display_name: "Kya & Co.",
      background_color: "#1a3d2e",
      button_color: "#1a3d2e",
      border_style: "rounded" as const,
      font_family: "inter" as const,
      logo: { type: "url" as const, url: "https://app.thekyaproject.com/brand/lockups/horizontal-cream.png" },
      icon: { type: "url" as const, url: "https://app.thekyaproject.com/icon-rounded-512.png" },
    },
    ...(trialEnd ? { custom_text: { submit: { message: note ?? checkoutNote(billingDay(new Date(trialEnd * 1000).toISOString())) } } } : {}),
  };
}
