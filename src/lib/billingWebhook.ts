/**
 * What the Stripe billing webhook (/api/public/stripe/billing) does with a
 * verified event. Everything it needs from Stripe and the database comes in
 * through `deps`, so npm run test:billing can run it on fixtures; the real
 * wiring is billingWebhook.server.ts.
 *
 * Never trusts event order (payments-plan section c): whatever the event, it
 * re-reads the subscription from Stripe and writes the row from that. Each
 * event is claimed once in billing_events; one that fails is left unfinished
 * and the error goes up, so the route returns 500 and Stripe retries.
 */
import { discountsToRemove, subscriptionRow, type BillingPrices, type PaidPlan, type SubscriptionLike, type SubscriptionRow } from "./billing";

/** The parts of a Stripe event the handler reads. */
export type BillingEventLike = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> & { id?: string } };
};

export type BillingDeps = {
  prices: BillingPrices;
  retrieveSubscription(id: string): Promise<SubscriptionLike>;
  /** The account a Stripe customer belongs to (billing_customers), or null. */
  userForCustomer(customerId: string): Promise<string | null>;
  record(userId: string, row: SubscriptionRow): Promise<void>;
  /** Clears every discount on a subscription (a founding one must have none). */
  removeDiscounts(subscriptionId: string): Promise<void>;
  /** True when the event still needs handling (new, or an earlier try failed). */
  claimEvent(eventId: string, type: string, objectId: string | null): Promise<boolean>;
  finishEvent(eventId: string, outcome: string): Promise<void>;
  /** The free season's end, read when the saved card arrives. */
  seasonEnd(): Promise<string | null>;
  /** The card a save-the-card Checkout collected. */
  setupPaymentMethod(setupIntentId: string): Promise<string | null>;
  /** True when this customer already has a subscription that hasn't ended. */
  customerHasSubscription(customerId: string): Promise<boolean>;
  createSubscription(input: {
    customerId: string; priceId: string; paymentMethodId: string; trialEnd: number | null;
    userId: string; plan: PaidPlan; idempotencyKey: string;
  }): Promise<SubscriptionLike>;
};

export type BillingWebhookResult =
  | { handled: "recorded"; subscription: string; plan: string; status: string }
  | { handled: "duplicate" }
  | { handled: "already_subscribed" }
  | { handled: "ignored"; why: string };

const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
]);
const INVOICE_EVENTS = new Set(["invoice.paid", "invoice.payment_failed", "invoice.payment_succeeded"]);

const idOf = (v: unknown): string | null =>
  typeof v === "string" ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null;

/** Which subscription an event is about, or why it isn't ours. */
export function subscriptionIdOf(event: BillingEventLike): { id: string } | { ignore: string } {
  const o = event.data.object;
  if (event.type === "checkout.session.completed") {
    const md = (o.metadata ?? {}) as Record<string, string>;
    if (o.mode !== "subscription") return { ignore: "not a subscription checkout" };
    if (md.kind !== "flock_billing") return { ignore: "not a Flock billing checkout" };
    const id = idOf(o.subscription);
    return id ? { id } : { ignore: "checkout has no subscription" };
  }
  if (SUBSCRIPTION_EVENTS.has(event.type)) {
    return o.id ? { id: o.id } : { ignore: "subscription event without an id" };
  }
  if (INVOICE_EVENTS.has(event.type)) {
    // API 2025-03-31 and later: invoice.parent.subscription_details.subscription;
    // older versions: invoice.subscription.
    const parent = o.parent as { subscription_details?: { subscription?: unknown } } | null | undefined;
    const id = idOf(parent?.subscription_details?.subscription) ?? idOf(o.subscription);
    return id ? { id } : { ignore: "invoice isn't for a subscription" };
  }
  return { ignore: event.type };
}

/** A finished save-the-card Checkout (the last 48 hours of the free season). */
export function savedCardCheckout(event: BillingEventLike): { sessionId: string; customerId: string; setupIntentId: string; plan: string; userId: string } | null {
  if (event.type !== "checkout.session.completed") return null;
  const o = event.data.object;
  const md = (o.metadata ?? {}) as Record<string, string>;
  if (o.mode !== "setup" || md.kind !== "flock_billing" || o.status !== "complete") return null;
  const customerId = idOf(o.customer);
  const setupIntentId = idOf(o.setup_intent);
  if (!o.id || !customerId || !setupIntentId || !md.plan || !md.user_id) throw new Error("saved-card checkout is missing its details");
  return { sessionId: o.id, customerId, setupIntentId, plan: md.plan, userId: md.user_id };
}

/** Stripe refuses a trial that ends now or in the past, so a card that arrives
 *  in the season's last minute (or after it) is charged as it arrives. */
const TRIAL_END_MARGIN_S = 60;

async function startSavedCardSubscription(event: BillingEventLike, saved: NonNullable<ReturnType<typeof savedCardCheckout>>, deps: BillingDeps): Promise<BillingWebhookResult> {
  const fresh = await deps.claimEvent(event.id, event.type, saved.sessionId);
  if (!fresh) return { handled: "duplicate" };

  const userId = await deps.userForCustomer(saved.customerId);
  if (!userId) {
    await deps.finishEvent(event.id, "ignored: unknown customer");
    return { handled: "ignored", why: "unknown customer" };
  }
  if (saved.userId !== userId) throw new Error(`checkout ${saved.sessionId} metadata names another account`);
  // Never a second membership, whatever else happened.
  if (await deps.customerHasSubscription(saved.customerId)) {
    await deps.finishEvent(event.id, "already subscribed");
    return { handled: "already_subscribed" };
  }
  const plan = saved.plan as PaidPlan;
  const priceId = deps.prices[plan];
  if (!priceId) throw new Error(`no price for plan ${saved.plan}`);
  const paymentMethodId = await deps.setupPaymentMethod(saved.setupIntentId);
  if (!paymentMethodId) throw new Error(`setup ${saved.setupIntentId} has no card`);
  const end = await deps.seasonEnd();
  const endUnix = end ? Math.floor(new Date(end).getTime() / 1000) : NaN;
  if (!Number.isFinite(endUnix)) throw new Error("no free-season end to bill from");
  const trialEnd = endUnix > Math.floor(Date.now() / 1000) + TRIAL_END_MARGIN_S ? endUnix : null;

  const sub = await deps.createSubscription({
    customerId: saved.customerId, priceId, paymentMethodId, trialEnd, userId, plan,
    // A retry of this event returns the same subscription.
    idempotencyKey: `flock-saved-card-${saved.sessionId}-${trialEnd ?? "now"}`,
  });
  const parsed = subscriptionRow(sub, deps.prices);
  if (!parsed.ok) {
    // Its own customer.subscription events will write the row once it settles.
    await deps.finishEvent(event.id, `started: ${parsed.why}`);
    return { handled: "ignored", why: parsed.why };
  }
  await deps.record(userId, parsed.row);
  await deps.finishEvent(event.id, `recorded: ${parsed.row.plan} ${parsed.row.status}`);
  return { handled: "recorded", subscription: parsed.row.subscriptionId, plan: parsed.row.plan, status: parsed.row.status };
}

export async function handleBillingEvent(event: BillingEventLike, deps: BillingDeps): Promise<BillingWebhookResult> {
  const saved = savedCardCheckout(event);
  if (saved) return startSavedCardSubscription(event, saved, deps);

  const target = subscriptionIdOf(event);
  if ("ignore" in target) return { handled: "ignored", why: target.ignore };

  const fresh = await deps.claimEvent(event.id, event.type, target.id);
  if (!fresh) return { handled: "duplicate" };

  const sub = await deps.retrieveSubscription(target.id);
  const parsed = subscriptionRow(sub, deps.prices);
  if (!parsed.ok) {
    await deps.finishEvent(event.id, `ignored: ${parsed.why}`);
    return { handled: "ignored", why: parsed.why };
  }
  const row = parsed.row;

  // The account comes from billing_customers, which only the card step writes
  // (a customer it created for a signed-in member). Metadata must agree.
  const userId = await deps.userForCustomer(row.customerId);
  if (!userId) {
    await deps.finishEvent(event.id, "ignored: unknown customer");
    return { handled: "ignored", why: "unknown customer" };
  }
  const mdUser = sub.metadata?.user_id;
  if (mdUser && mdUser !== userId) throw new Error(`subscription ${sub.id} metadata names another account`);

  // Promotion codes never apply to the founding price (backlog 1.17). Checkout
  // doesn't offer them there; this catches one added any other way.
  const stripped = discountsToRemove(row.plan, sub).length > 0;
  if (stripped) await deps.removeDiscounts(sub.id);

  await deps.record(userId, row);
  await deps.finishEvent(event.id, `recorded: ${row.plan} ${row.status}${stripped ? ", discount removed" : ""}`);
  return { handled: "recorded", subscription: row.subscriptionId, plan: row.plan, status: row.status };
}
