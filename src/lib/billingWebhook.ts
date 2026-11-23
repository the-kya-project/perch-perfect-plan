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
import { subscriptionRow, type BillingPrices, type SubscriptionLike, type SubscriptionRow } from "./billing";

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
  /** True when the event still needs handling (new, or an earlier try failed). */
  claimEvent(eventId: string, type: string, objectId: string | null): Promise<boolean>;
  finishEvent(eventId: string, outcome: string): Promise<void>;
};

export type BillingWebhookResult =
  | { handled: "recorded"; subscription: string; plan: string; status: string }
  | { handled: "duplicate" }
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

export async function handleBillingEvent(event: BillingEventLike, deps: BillingDeps): Promise<BillingWebhookResult> {
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

  await deps.record(userId, row);
  await deps.finishEvent(event.id, `recorded: ${row.plan} ${row.status}`);
  return { handled: "recorded", subscription: row.subscriptionId, plan: row.plan, status: row.status };
}
