/**
 * What the Stripe webhook does with a verified event. Kept apart from the route
 * so it can be exercised with a constructed event in tests; the route is only
 * the signature check.
 */
import type Stripe from "stripe";
import { applyGiftRefund, isGiftPlan } from "./gifts";

export type GiftWebhookResult =
  | { handled: "recorded"; created: boolean; emails?: unknown }
  | { handled: "refunded"; updated: number; status: string; amountRefundedCents: number }
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
  // Every refund is recorded. A partial refund leaves the gift valid and only
  // raises amount_refunded_cents; once the refunds reach the amount paid (one
  // full refund, or partial ones adding up) the gift becomes 'refunded'. The
  // rules are applyGiftRefund() in gifts.ts.
  //
  // LAUNCH RULE: a refunded gift keeps redeemed_by. The code that turns gifts
  // into entitlements at launch must grant only where giftGrantsMembership()
  // (status = 'redeemed') is true, never on "has a redeemer". When a refund
  // cancels a gift that was already granted, that code must also end the
  // entitlement; this handler is where to hook it in (see becameRefunded).
  const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntent) return { handled: "ignored", why: "charge has no payment intent" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: gift, error: readError } = await supabaseAdmin
    .from("gift_purchases")
    .select("id, status, amount_paid_cents, amount_refunded_cents")
    .eq("stripe_payment_intent_id", paymentIntent)
    .maybeSingle();
  if (readError) throw new Error(`gift refund read failed: ${readError.message}`);
  if (!gift) return { handled: "ignored", why: "no gift for this payment" };

  const next = applyGiftRefund(
    { status: gift.status, amountPaidCents: gift.amount_paid_cents, amountRefundedCents: gift.amount_refunded_cents },
    { amountRefundedCents: charge.amount_refunded ?? 0, fullyRefunded: charge.refunded === true },
  );
  if (!next.changed) return { handled: "refunded", updated: 0, status: gift.status, amountRefundedCents: gift.amount_refunded_cents };

  // Guarded on what was read, so two refund events at once can't overwrite
  // each other. If the guard misses, throwing makes Stripe redeliver, and the
  // retry reads the newer row.
  const { data, error } = await supabaseAdmin
    .from("gift_purchases")
    .update({
      status: next.status,
      amount_refunded_cents: next.amountRefundedCents,
      ...(next.becameRefunded ? { refunded_at: new Date().toISOString() } : {}),
    })
    .eq("id", gift.id)
    .eq("status", gift.status)
    .eq("amount_refunded_cents", gift.amount_refunded_cents)
    .select("id");
  if (error) throw new Error(`gift refund update failed: ${error.message}`);
  if ((data ?? []).length === 0) throw new Error("gift refund update raced another update; Stripe will retry");
  return { handled: "refunded", updated: 1, status: next.status, amountRefundedCents: next.amountRefundedCents };
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
