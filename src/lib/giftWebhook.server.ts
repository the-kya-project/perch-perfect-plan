/**
 * What the Stripe webhook does with a verified event. Kept apart from the route
 * so it can be exercised with a constructed event in tests; the route is only
 * the signature check.
 */
import type Stripe from "stripe";
import { isGiftPlan } from "./gifts";

export type GiftWebhookResult =
  | { handled: "recorded"; created: boolean; emails?: unknown }
  | { handled: "refunded"; updated: number }
  | { handled: "ignored"; why: string };

function promoCodeOf(session: Stripe.Checkout.Session): string | null {
  for (const d of session.discounts ?? []) {
    const pc = d.promotion_code;
    if (pc && typeof pc === "object" && "code" in pc && pc.code) return pc.code;
  }
  return null;
}

async function recordPurchase(event: Stripe.Event, sessionId: string): Promise<GiftWebhookResult> {
  const { getStripe } = await import("./stripe.server");
  // Re-read the session from Stripe rather than trusting the event body
  // alone, with the promotion code expanded so its customer-facing code
  // (e.g. BLACKFRIDAY26) is available rather than just its id.
  const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["discounts.promotion_code"] });

  const md = session.metadata ?? {};
  if (md.kind !== "gift") return { handled: "ignored", why: "not a gift session" };
  if (session.payment_status !== "paid") return { handled: "ignored", why: `payment_status ${session.payment_status}` };
  if (!isGiftPlan(md.plan)) throw new Error(`gift session ${session.id} has unknown plan ${md.plan}`);
  const buyerEmail = session.customer_details?.email;
  if (!buyerEmail) throw new Error(`gift session ${session.id} has no buyer email`);

  const paymentIntent = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
  const promoCode = promoCodeOf(session);
  const recipientEmail = md.recipient_email || null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Every argument is sent, null included: the function has no defaults, and
  // PostgREST matches an RPC by its argument names, so leaving one out (say,
  // no promo code) finds no function at all.
  const { data, error } = await supabaseAdmin.rpc("record_gift_purchase", {
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntent,
    p_plan: md.plan,
    p_buyer_email: buyerEmail,
    p_buyer_name: session.customer_details?.name ?? null,
    p_recipient_name: md.recipient_name ?? "",
    p_recipient_email: recipientEmail,
    p_message: md.message || null,
    p_send_on: recipientEmail ? md.send_on || null : null,
    p_amount_paid_cents: session.amount_total ?? 0,
    p_promo_code: promoCode,
    // When Stripe completed the payment: the event's own timestamp.
    p_purchased_at: new Date(event.created * 1000).toISOString(),
  });
  if (error) throw new Error(`record_gift_purchase failed: ${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.id) throw new Error("record_gift_purchase returned no row");

  if (row.created) {
    const { data: g } = await supabaseAdmin.from("gift_purchases").select("giving_rate").eq("id", row.id).maybeSingle();
    const { captureGiftPurchased } = await import("./giftTelemetry.server");
    await captureGiftPurchased({
      checkoutSessionId: session.id,
      plan: md.plan,
      promoCode,
      amountCents: session.amount_total ?? 0,
      givingRate: Number(g?.giving_rate ?? 0.2),
    });
  }

  // Emails are best effort here: the row is safe, and the daily cron retries
  // anything that failed. A send problem must not make Stripe redeliver.
  let emails: unknown;
  try {
    const { deliverGiftEmails } = await import("./giftEmails.server");
    emails = await deliverGiftEmails(row.id);
  } catch (err) {
    console.error("[gift-webhook] email delivery failed", err instanceof Error ? err.message : err);
    emails = "error";
  }
  return { handled: "recorded", created: !!row.created, emails };
}

async function markRefunded(charge: Stripe.Charge): Promise<GiftWebhookResult> {
  // A partial refund leaves the gift valid; only a full refund cancels it.
  if (!charge.refunded) return { handled: "ignored", why: "partial refund" };
  const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntent) return { handled: "ignored", why: "charge has no payment intent" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("gift_purchases")
    .update({ status: "refunded", refunded_at: new Date().toISOString() })
    .eq("stripe_payment_intent_id", paymentIntent)
    .neq("status", "refunded")
    .select("id");
  if (error) throw new Error(`gift refund update failed: ${error.message}`);
  return { handled: "refunded", updated: (data ?? []).length };
}

export async function handleGiftWebhookEvent(event: Stripe.Event): Promise<GiftWebhookResult> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return recordPurchase(event, (event.data.object as Stripe.Checkout.Session).id);
    case "charge.refunded":
      return markRefunded(event.data.object as Stripe.Charge);
    default:
      return { handled: "ignored", why: event.type };
  }
}
