// Flock billing (backlog 1.14): the server functions behind the card step on
// Membership (/flock/you/membership). Switched off: with BILLING_ENABLED unset
// every one of them returns "off" before reading anything.
//
// None of these writes an entitlement. A paid row is written only by the
// billing webhook (src/routes/api/public/stripe/billing.ts) after Stripe has
// the card; Checkout carries the account to it through the customer, which is
// created here for the signed-in member and stored in billing_customers.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { formatCents } from "./gifts";
import { BILLING_CHOICES, billingDay, billingEnabled, checkoutDesign, checkoutPlan, firstCharge, saveCardExpiry, saveCardNote, checkoutNote, liveSubscription, type BillingLocale, type BillingState, type NoteT, type PaidPlan } from "./billing";

type Ctx = { supabase: any; userId: string; claims: { email?: string } };

/** Billing is on, and the caller may see the Flock (flock_enabled(): admins
 *  only today). */
async function allowed(context: Ctx): Promise<boolean> {
  if (!billingEnabled(process.env.BILLING_ENABLED)) return false;
  const { data, error } = await context.supabase.rpc("flock_enabled");
  return !error && data === true;
}

async function stripeRows(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any)
    .from("entitlements")
    .select("plan, status, current_period_end, will_renew")
    .eq("user_id", userId)
    .eq("source", "stripe")
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't read billing.");
  return (data ?? []) as { plan: PaidPlan; status: "active" | "trialing" | "past_due" | "canceled"; current_period_end: string | null; will_renew: boolean | null }[];
}

async function foundingPriceOpen(userId: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).rpc("billing_founding_price_open", { p_user_id: userId });
  if (error) throw new Error("Couldn't read billing.");
  return data === true;
}

async function seasonEnd(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("flock_public_dates");
  if (error) throw new Error("Couldn't read billing.");
  const row = Array.isArray(data) ? data[0] : data;
  return row?.free_season_ends_at ?? null;
}

async function foundingSpot(userId: string): Promise<number | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await (supabaseAdmin as any).from("founding_claims").select("spot_number").eq("user_id", userId).maybeSingle();
  if (error) return null;
  return (data?.spot_number as number | undefined) ?? null;
}

/** The last four digits of the card on the member's newest subscription, read
 *  from Stripe each time and never stored. A failure only hides the Card row. */
async function cardLast4(userId: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await (supabaseAdmin as any).from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    if (!data?.stripe_customer_id) return null;
    const { getBillingStripe } = await import("./stripe.server");
    const subs = await getBillingStripe().subscriptions.list({ customer: data.stripe_customer_id, status: "all", limit: 5, expand: ["data.default_payment_method"] });
    const sub = subs.data.find((s) => s.status !== "canceled" && s.status !== "incomplete_expired");
    const method = sub?.default_payment_method;
    return method && typeof method !== "string" ? method.card?.last4 ?? null : null;
  } catch (err) {
    console.error("[billing] card read failed", err instanceof Error ? err.message : err);
    return null;
  }
}

export const getBillingState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingState> => {
    if (!(await allowed(context as Ctx))) return { enabled: false };
    const userId = (context as Ctx).userId;
    const [rows, founding, end, spot] = await Promise.all([stripeRows(userId), foundingPriceOpen(userId), seasonEnd(), foundingSpot(userId)]);

    // Prices come from Stripe, never hard-coded. A missing one is left out.
    const { getBillingStripe, billingPrices } = await import("./stripe.server");
    const stripe = getBillingStripe();
    const ids = billingPrices();
    const prices: Partial<Record<PaidPlan, number>> = {};
    await Promise.all(
      (Object.entries(ids) as [PaidPlan, string][]).map(async ([plan, id]) => {
        const p = await stripe.prices.retrieve(id);
        if (p.unit_amount != null) prices[plan] = p.unit_amount;
      }),
    );
    const live = liveSubscription(rows);
    const last4 = live ? await cardLast4(userId) : null;
    return {
      enabled: true,
      seasonEndsAt: end,
      foundingPriceOpen: founding,
      foundingSpot: spot,
      prices,
      subscription: live ? { plan: live.plan, status: live.status, current_period_end: live.current_period_end, will_renew: live.will_renew, card_last4: last4 } : null,
    };
  });

/** The member's Stripe customer, created once and kept in billing_customers. */
async function customerFor(userId: string, email: string | undefined): Promise<string> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;
  const read = async () => {
    const { data, error } = await db.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
    if (error) throw new Error("Couldn't read billing.");
    return (data?.stripe_customer_id as string | undefined) ?? null;
  };
  const existing = await read();
  if (existing) return existing;
  const { getBillingStripe } = await import("./stripe.server");
  const customer = await getBillingStripe().customers.create({ email, metadata: { user_id: userId } });
  // Two clicks at once can each create a customer; the first stored wins and
  // the other is never used.
  await db.from("billing_customers").upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: "user_id", ignoreDuplicates: true });
  const stored = await read();
  if (!stored) throw new Error("Couldn't save billing.");
  return stored;
}

export type BillingCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: "off" | "on_file" | "not_ready" | "unavailable" | "error" };

/** The member's language for Stripe's page and our sentence on it. */
async function noteTranslator(locale: BillingLocale): Promise<NoteT> {
  const { globalI18n } = await import("@/lib/i18n/i18n");
  const fixed = globalI18n.getFixedT(locale);
  return (key, text, v) => fixed(key, text, v) as string;
}

export const startBillingCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { choice: string; locale?: string }) => z.object({ choice: z.enum(BILLING_CHOICES), locale: z.enum(["en", "nl"]).default("en") }).parse(d))
  .handler(async ({ data, context }): Promise<BillingCheckoutResult> => {
    const ctx = context as Ctx;
    if (!(await allowed(ctx))) return { ok: false, reason: "off" };
    try {
      if (liveSubscription(await stripeRows(ctx.userId))) return { ok: false, reason: "on_file" };
      const fc = firstCharge(await seasonEnd());
      if (!fc.ok) return { ok: false, reason: "not_ready" };
      const plan = checkoutPlan(data.choice, await foundingPriceOpen(ctx.userId));

      const { getBillingStripe, billingPriceId, StripeNotConfigured } = await import("./stripe.server");
      let price: string;
      try { price = billingPriceId(plan); } catch (err) { if (err instanceof StripeNotConfigured) return { ok: false, reason: "unavailable" }; throw err; }
      const customer = await customerFor(ctx.userId, ctx.claims?.email);
      const { getRequest } = await import("@tanstack/react-start/server");
      const origin = new URL(getRequest().url).origin;
      const stripe = getBillingStripe();
      // Only one open checkout per member, so two tabs can't start two memberships.
      const open = await stripe.checkout.sessions.list({ customer, status: "open", limit: 100 });
      await Promise.all(open.data.filter((s) => s.metadata?.kind === "flock_billing").map((s) => stripe.checkout.sessions.expire(s.id)));
      const metadata = { kind: "flock_billing", user_id: ctx.userId, plan };
      const urls = { success_url: `${origin}/flock/you/membership?billing=done`, cancel_url: `${origin}/flock/you/membership` };
      const locale = data.locale;
      const noteT = await noteTranslator(locale);
      let session;
      if (fc.saveCardFirst && fc.trialEnd) {
        // Under 48 hours to the season's end, Checkout can't start the trial.
        // It saves the card, and the webhook starts the subscription.
        const amount = (await stripe.prices.retrieve(price)).unit_amount;
        if (amount == null) return { ok: false, reason: "unavailable" };
        const note = saveCardNote(plan, formatCents(amount), billingDay(new Date(fc.trialEnd * 1000).toISOString(), locale), noteT);
        session = await stripe.checkout.sessions.create({
          ...checkoutDesign(fc.trialEnd, note, locale),
          mode: "setup",
          customer,
          client_reference_id: ctx.userId,
          payment_method_types: ["card"],
          expires_at: saveCardExpiry(fc.trialEnd),
          setup_intent_data: { metadata },
          metadata,
          ...urls,
        });
      } else {
        session = await stripe.checkout.sessions.create({
          ...checkoutDesign(fc.trialEnd, fc.trialEnd ? checkoutNote(billingDay(new Date(fc.trialEnd * 1000).toISOString(), locale), noteT) : undefined, locale),
          mode: "subscription",
          customer,
          client_reference_id: ctx.userId,
          line_items: [{ price, quantity: 1 }],
          // The card is always collected, even with $0 due today.
          payment_method_collection: "always",
          subscription_data: {
            ...(fc.trialEnd ? { trial_end: fc.trialEnd } : {}),
            metadata,
          },
          metadata,
          ...urls,
        });
      }
      if (!session.url) return { ok: false, reason: "error" };
      return { ok: true, url: session.url };
    } catch (err) {
      console.error("[billing] checkout failed", err instanceof Error ? err.message : err);
      return { ok: false, reason: "error" };
    }
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { locale?: string }) => z.object({ locale: z.enum(["en", "nl"]).default("en") }).parse(d))
  .handler(async ({ data: input, context }): Promise<BillingCheckoutResult> => {
    const ctx = context as Ctx;
    if (!(await allowed(ctx))) return { ok: false, reason: "off" };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data } = await (supabaseAdmin as any).from("billing_customers").select("stripe_customer_id").eq("user_id", ctx.userId).maybeSingle();
      if (!data?.stripe_customer_id) return { ok: false, reason: "unavailable" };
      const { getBillingStripe } = await import("./stripe.server");
      const { getRequest } = await import("@tanstack/react-start/server");
      const origin = new URL(getRequest().url).origin;
      const portal = await getBillingStripe().billingPortal.sessions.create({
        customer: data.stripe_customer_id,
        locale: input.locale,
        return_url: `${origin}/flock/you/membership`,
      });
      return { ok: true, url: portal.url };
    } catch (err) {
      console.error("[billing] portal failed", err instanceof Error ? err.message : err);
      return { ok: false, reason: "error" };
    }
  });
