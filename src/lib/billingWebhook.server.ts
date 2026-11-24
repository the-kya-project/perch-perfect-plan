/**
 * The real Stripe and database behind handleBillingEvent (billingWebhook.ts).
 * Every write goes through the service-role functions from
 * 20261123180000_billing_foundation.sql; a database error throws, so the route
 * returns 500 and Stripe retries.
 */
import type { SubscriptionLike } from "./billing";
import { handleBillingEvent, type BillingDeps, type BillingEventLike } from "./billingWebhook";

export async function handleStripeBillingEvent(event: BillingEventLike) {
  const { getBillingStripe, billingPrices } = await import("./stripe.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const stripe = getBillingStripe();
  const db = supabaseAdmin as any;

  const deps: BillingDeps = {
    prices: billingPrices(),
    retrieveSubscription: async (id) => (await stripe.subscriptions.retrieve(id)) as unknown as SubscriptionLike,
    userForCustomer: async (customerId) => {
      const { data, error } = await db.from("billing_customers").select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
      if (error) throw new Error(`billing customer read failed: ${error.message}`);
      return data?.user_id ?? null;
    },
    record: async (userId, row) => {
      const { error } = await db.rpc("billing_record_stripe_subscription", {
        p_user_id: userId,
        p_customer_id: row.customerId,
        p_subscription_id: row.subscriptionId,
        p_plan: row.plan,
        p_status: row.status,
        p_product_id: row.productId,
        p_current_period_end: row.currentPeriodEnd,
        p_cancel_at_period_end: row.cancelAtPeriodEnd,
        p_will_renew: row.willRenew,
      });
      if (error) throw new Error(`billing_record_stripe_subscription failed: ${error.message}`);
    },
    claimEvent: async (eventId, type, objectId) => {
      const { data, error } = await db.rpc("billing_claim_event", { p_provider: "stripe", p_event_id: eventId, p_event_type: type, p_object_id: objectId });
      if (error) throw new Error(`billing_claim_event failed: ${error.message}`);
      return data === true;
    },
    finishEvent: async (eventId, outcome) => {
      const { error } = await db.rpc("billing_finish_event", { p_provider: "stripe", p_event_id: eventId, p_outcome: outcome });
      if (error) throw new Error(`billing_finish_event failed: ${error.message}`);
    },
    seasonEnd: async () => {
      const { data, error } = await db.rpc("flock_public_dates");
      if (error) throw new Error(`flock_public_dates failed: ${error.message}`);
      const row = Array.isArray(data) ? data[0] : data;
      return row?.free_season_ends_at ?? null;
    },
    setupPaymentMethod: async (id) => {
      const setup = await stripe.setupIntents.retrieve(id);
      const method = setup.payment_method;
      return typeof method === "string" ? method : method?.id ?? null;
    },
    customerHasSubscription: async (customerId) => {
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      return subs.data.some((s) => s.status !== "canceled" && s.status !== "incomplete_expired");
    },
    createSubscription: async ({ customerId, priceId, paymentMethodId, trialEnd, userId, plan, idempotencyKey }) =>
      (await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: paymentMethodId,
        off_session: true,
        ...(trialEnd ? { trial_end: trialEnd } : {}),
        metadata: { kind: "flock_billing", user_id: userId, plan },
      }, { idempotencyKey })) as unknown as SubscriptionLike,
  };
  return handleBillingEvent(event, deps);
}
