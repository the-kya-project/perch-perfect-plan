/**
 * Flock billing (backlog 1.14): the switch, the webhook's signature check
 * (Stripe's own library, a throwaway secret), plan and status mapping, the
 * first-charge rule, the card step's states, and the webhook handler run on
 * fixture events with a fake Stripe and database: idempotency, event order,
 * accounts, and what it ignores.
 *
 *   npm run test:billing
 *
 * Nothing here talks to Stripe or a database. The database side is pinned by
 * supabase/checks/billing_checks.sql.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Stripe from "stripe";
import {
  billingEnabled, cardStep, checkoutPlan, discountsToRemove, entitlementStatus, firstCharge, liveSubscription, MIN_TRIAL_LEAD_MS,
  planForPrice, promotionCodesAllowed, subscriptionRow, type BillingPrices, type BillingState, type SubscriptionLike, type SubscriptionRow,
} from "@/lib/billing";
import { handleBillingEvent, subscriptionIdOf, type BillingDeps, type BillingEventLike } from "@/lib/billingWebhook";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const PRICES: BillingPrices = { founding: "price_founding", monthly: "price_monthly", annual: "price_yearly" };
const NOW = new Date("2027-03-01T15:00:00Z");
const SEASON_END = "2027-04-01T04:00:00Z"; // midnight Eastern
const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

function sub(over: Partial<SubscriptionLike> & { price?: string; periodEnd?: string } = {}): SubscriptionLike {
  const { price = "price_monthly", periodEnd = "2027-05-01T04:00:00Z", ...rest } = over;
  return {
    id: "sub_1",
    status: "trialing",
    customer: "cus_1",
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: unix(SEASON_END),
    ended_at: null,
    canceled_at: null,
    metadata: { kind: "flock_billing", user_id: "user_1" },
    items: { data: [{ current_period_end: unix(periodEnd), price: { id: price, product: "prod_flock" } }] },
    ...rest,
  };
}

// ── The switch ──────────────────────────────────────────────────────────────
await check("billing is off unless BILLING_ENABLED is exactly \"true\"", () => {
  assert.equal(billingEnabled(undefined), false);
  assert.equal(billingEnabled(""), false);
  assert.equal(billingEnabled("1"), false);
  assert.equal(billingEnabled("TRUE"), false);
  assert.equal(billingEnabled("on"), false);
  assert.equal(billingEnabled("true"), true);
});

// ── Webhook signature, with the billing secret ──────────────────────────────
const stripe = new Stripe("sk_test_not_a_real_key");
const SECRET = "whsec_billing_test_only";
const payload = JSON.stringify({ id: "evt_1", object: "event", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
await check("a correctly signed billing event verifies", async () => {
  const ev = await stripe.webhooks.constructEventAsync(payload, header, SECRET);
  assert.equal(ev.type, "customer.subscription.updated");
});
await check("the gift webhook's secret doesn't open the billing webhook", async () => {
  await assert.rejects(stripe.webhooks.constructEventAsync(payload, header, "whsec_test_only_not_a_real_secret"));
});
await check("a tampered or replayed billing event is rejected", async () => {
  await assert.rejects(stripe.webhooks.constructEventAsync(payload.replace("sub_1", "sub_2"), header, SECRET));
  const old = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  await assert.rejects(stripe.webhooks.constructEventAsync(payload, old, SECRET));
});

// ── Route: off means 503, before anything is read ──────────────────────────
await check("the route returns 503 while billing is off or the secret is missing, then checks the signature", () => {
  const src = readFileSync("src/routes/api/public/stripe/billing.ts", "utf8");
  const off = src.indexOf("billingEnabled(process.env.BILLING_ENABLED)");
  const secret = src.indexOf("STRIPE_BILLING_WEBHOOK_SECRET;");
  const sig = src.indexOf("constructEventAsync");
  assert.ok(off > 0 && secret > off && sig > secret, "switch, then secret, then signature");
  assert.match(src.slice(off, secret + 200), /503/);
  assert.doesNotMatch(src, /STRIPE_WEBHOOK_SECRET\b/, "never the gift webhook's secret");
});
await check("billing uses Stripe test mode only", () => {
  const src = readFileSync("src/lib/stripe.server.ts", "utf8");
  const fn = src.slice(src.indexOf("export function getBillingStripe"));
  assert.match(fn.slice(0, 400), /sk_test_/);
  for (const f of ["src/lib/billing.functions.ts", "src/lib/billingWebhook.server.ts", "src/routes/api/public/stripe/billing.ts"]) {
    const s = readFileSync(f, "utf8");
    assert.doesNotMatch(s, /\bgetStripe\(\)/, `${f} must use getBillingStripe()`);
  }
});

// ── Mapping ────────────────────────────────────────────────────────────────
await check("a paid row's plan comes from its price", () => {
  assert.equal(planForPrice("price_founding", PRICES), "founding");
  assert.equal(planForPrice("price_monthly", PRICES), "monthly");
  assert.equal(planForPrice("price_yearly", PRICES), "annual");
  assert.equal(planForPrice("price_gift_year", PRICES), null);
  assert.equal(planForPrice(undefined, PRICES), null);
  assert.equal(planForPrice("price_monthly", {}), null, "an unset price matches nothing");
});
await check("Stripe statuses map to ours; incomplete gets no row", () => {
  assert.equal(entitlementStatus("trialing"), "trialing");
  assert.equal(entitlementStatus("active"), "active");
  assert.equal(entitlementStatus("past_due"), "past_due");
  assert.equal(entitlementStatus("unpaid"), "past_due");
  assert.equal(entitlementStatus("canceled"), "canceled");
  assert.equal(entitlementStatus("incomplete_expired"), "canceled");
  assert.equal(entitlementStatus("paused"), "canceled");
  assert.equal(entitlementStatus("incomplete"), null);
});
await check("a card added in the free season: trialing until the season's end", () => {
  const r = subscriptionRow(sub(), PRICES, NOW);
  assert.ok(r.ok);
  assert.deepEqual(r.row, {
    customerId: "cus_1", subscriptionId: "sub_1", plan: "monthly", status: "trialing", productId: "prod_flock",
    currentPeriodEnd: new Date(SEASON_END).toISOString(), cancelAtPeriodEnd: false, willRenew: true,
  });
});
await check("active: access to the end of the paid period (read from the item)", () => {
  const r = subscriptionRow(sub({ status: "active", trial_end: null, price: "price_yearly", periodEnd: "2028-04-01T04:00:00Z" }), PRICES, NOW);
  assert.ok(r.ok);
  assert.equal(r.row.plan, "annual");
  assert.equal(r.row.currentPeriodEnd, "2028-04-01T04:00:00.000Z");
});
await check("auto-renew off: still active, won't renew", () => {
  const r = subscriptionRow(sub({ status: "active", cancel_at_period_end: true }), PRICES, NOW);
  assert.ok(r.ok);
  assert.equal(r.row.status, "active");
  assert.equal(r.row.cancelAtPeriodEnd, true);
  assert.equal(r.row.willRenew, false);
  const r2 = subscriptionRow(sub({ status: "active", cancel_at: unix("2027-06-01T00:00:00Z") }), PRICES, NOW);
  assert.ok(r2.ok && r2.row.willRenew === false, "a scheduled cancel won't renew either");
});
await check("ended: canceled, access stops when it ended", () => {
  const r = subscriptionRow(sub({ status: "canceled", ended_at: unix("2027-03-01T12:00:00Z") }), PRICES, NOW);
  assert.ok(r.ok);
  assert.equal(r.row.status, "canceled");
  assert.equal(r.row.currentPeriodEnd, "2027-03-01T12:00:00.000Z");
  assert.equal(r.row.willRenew, false);
  const r2 = subscriptionRow(sub({ status: "canceled" }), PRICES, NOW);
  assert.ok(r2.ok && r2.row.currentPeriodEnd === NOW.toISOString(), "no end recorded: now");
});
await check("a subscription that isn't a single Flock price is refused", () => {
  assert.equal(subscriptionRow(sub({ price: "price_other" }), PRICES, NOW).ok, false);
  assert.equal(subscriptionRow(sub({ status: "incomplete" }), PRICES, NOW).ok, false);
  const two = sub();
  two.items.data.push({ current_period_end: 1, price: { id: "price_monthly", product: "prod_flock" } });
  assert.equal(subscriptionRow(two, PRICES, NOW).ok, false);
  assert.equal(subscriptionRow({ ...sub(), items: { data: [] } }, PRICES, NOW).ok, false);
});

// ── First charge and price ─────────────────────────────────────────────────
await check("no free-season end stored: the card step can't open", () => {
  assert.deepEqual(firstCharge(null, NOW), { ok: false, reason: "no_season_end" });
  assert.deepEqual(firstCharge("not a date", NOW), { ok: false, reason: "no_season_end" });
});
await check("the season's end ahead: $0 today, a trial to exactly that moment", () => {
  const fc = firstCharge(SEASON_END, NOW);
  assert.ok(fc.ok);
  assert.equal(fc.trialEnd, unix(SEASON_END));
  assert.equal(fc.firstChargeOn, new Date(SEASON_END).toISOString());
});
await check("within Stripe's 48 hours of the end, or after it: charged today, no trial", () => {
  const close = new Date(new Date(SEASON_END).getTime() - MIN_TRIAL_LEAD_MS + 1000);
  const fc = firstCharge(SEASON_END, close);
  assert.ok(fc.ok && fc.trialEnd === null && fc.firstChargeOn === close.toISOString());
  const after = firstCharge(SEASON_END, new Date("2027-05-01T00:00:00Z"));
  assert.ok(after.ok && after.trialEnd === null);
  const justEnough = firstCharge(SEASON_END, new Date(new Date(SEASON_END).getTime() - MIN_TRIAL_LEAD_MS));
  assert.ok(justEnough.ok && justEnough.trialEnd === unix(SEASON_END));
});
await check("a founder with the price still open gets founding; no yearly founding option", () => {
  assert.equal(checkoutPlan("monthly", true), "founding");
  assert.equal(checkoutPlan("annual", true), "founding");
  assert.equal(checkoutPlan("monthly", false), "monthly");
  assert.equal(checkoutPlan("annual", false), "annual");
});
await check("a live subscription blocks a second checkout; an ended one doesn't", () => {
  const row = (status: string, end: string | null) => ({ status, current_period_end: end });
  assert.equal(liveSubscription([row("canceled", "2027-02-01T00:00:00Z")], NOW), null);
  assert.equal(liveSubscription([row("past_due", "2027-02-01T00:00:00Z")], NOW), null);
  assert.ok(liveSubscription([row("past_due", "2027-03-10T00:00:00Z")], NOW));
  assert.ok(liveSubscription([row("trialing", SEASON_END)], NOW));
  assert.ok(liveSubscription([row("canceled", null), row("active", null)], NOW));
});

// ── The card step ──────────────────────────────────────────────────────────
const on = (over: Partial<Extract<BillingState, { enabled: true }>> = {}): BillingState => ({
  enabled: true, seasonEndsAt: SEASON_END, foundingPriceOpen: false, prices: { monthly: 3000, annual: 30000, founding: 1500 }, subscription: null, ...over,
});
await check("billing off, still loading, or the native app: hidden (Membership looks as before)", () => {
  assert.deepEqual(cardStep({ enabled: false }, false, NOW), { kind: "hidden" });
  assert.deepEqual(cardStep(undefined, false, NOW), { kind: "hidden" });
  assert.deepEqual(cardStep(on(), true, NOW), { kind: "hidden" });
});
await check("no season end yet: not ready", () => {
  assert.deepEqual(cardStep(on({ seasonEndsAt: null }), false, NOW), { kind: "not_ready" });
});
await check("choose: $0 today with the first charge on the season's end; founders see the founding price", () => {
  assert.deepEqual(cardStep(on(), false, NOW), { kind: "choose", founding: false, firstChargeOn: new Date(SEASON_END).toISOString(), chargedToday: false });
  const f = cardStep(on({ foundingPriceOpen: true }), false, NOW);
  assert.ok(f.kind === "choose" && f.founding);
});
await check("card on file: first charge date while trialing, renewal state after", () => {
  const t = cardStep(on({ subscription: { plan: "founding", status: "trialing", current_period_end: SEASON_END, will_renew: true } }), false, NOW);
  assert.deepEqual(t, { kind: "on_file", plan: "founding", status: "trialing", firstChargeOn: SEASON_END, willRenew: true });
  const a = cardStep(on({ subscription: { plan: "annual", status: "active", current_period_end: "2028-04-01T04:00:00Z", will_renew: false } }), false, NOW);
  assert.ok(a.kind === "on_file" && a.firstChargeOn === null && a.willRenew === false);
});

// ── The handler, on fixtures ───────────────────────────────────────────────
function fakeDeps(subs: Record<string, SubscriptionLike>, customers: Record<string, string> = { cus_1: "user_1" }) {
  const events = new Map<string, { done: boolean; outcome?: string }>();
  const rows: { userId: string; row: SubscriptionRow }[] = [];
  const cleared: string[] = [];
  let retrieved = 0;
  const deps: BillingDeps = {
    prices: PRICES,
    retrieveSubscription: async (id) => {
      retrieved++;
      const s = subs[id];
      if (!s) throw new Error(`no such subscription ${id}`);
      return s;
    },
    userForCustomer: async (c) => customers[c] ?? null,
    record: async (userId, row) => {
      const i = rows.findIndex((r) => r.row.subscriptionId === row.subscriptionId);
      if (i >= 0) rows[i] = { userId, row }; else rows.push({ userId, row });
    },
    removeDiscounts: async (id) => { cleared.push(id); },
    claimEvent: async (id) => {
      const e = events.get(id);
      if (!e) { events.set(id, { done: false }); return true; }
      return !e.done;
    },
    finishEvent: async (id, outcome) => { events.set(id, { done: true, outcome }); },
  };
  return { deps, rows, events, cleared, get retrieved() { return retrieved; } };
}
const ev = (id: string, type: string, object: Record<string, unknown>): BillingEventLike => ({ id, type, data: { object } });

await check("which subscription an event is about", () => {
  assert.deepEqual(subscriptionIdOf(ev("e", "checkout.session.completed", { mode: "subscription", metadata: { kind: "flock_billing" }, subscription: "sub_1" })), { id: "sub_1" });
  assert.ok("ignore" in subscriptionIdOf(ev("e", "checkout.session.completed", { mode: "payment", metadata: { kind: "gift" } })), "a gift checkout");
  assert.ok("ignore" in subscriptionIdOf(ev("e", "checkout.session.completed", { mode: "subscription", metadata: {} })), "someone else's subscription checkout");
  assert.deepEqual(subscriptionIdOf(ev("e", "customer.subscription.deleted", { id: "sub_9" })), { id: "sub_9" });
  assert.deepEqual(subscriptionIdOf(ev("e", "invoice.paid", { id: "in_1", parent: { subscription_details: { subscription: "sub_3" } } })), { id: "sub_3" });
  assert.deepEqual(subscriptionIdOf(ev("e", "invoice.payment_failed", { id: "in_1", subscription: { id: "sub_4" } })), { id: "sub_4" });
  assert.ok("ignore" in subscriptionIdOf(ev("e", "invoice.paid", { id: "in_1", parent: null })), "a one-off invoice");
  assert.ok("ignore" in subscriptionIdOf(ev("e", "charge.refunded", { id: "ch_1" })));
});
await check("checkout completed: the row is written from the re-read subscription", async () => {
  const f = fakeDeps({ sub_1: sub() });
  const r = await handleBillingEvent(ev("evt_a", "checkout.session.completed", { mode: "subscription", metadata: { kind: "flock_billing" }, subscription: "sub_1" }), f.deps);
  assert.deepEqual(r, { handled: "recorded", subscription: "sub_1", plan: "monthly", status: "trialing" });
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].userId, "user_1");
  assert.equal(f.events.get("evt_a")?.done, true);
});
await check("the same event twice is handled once", async () => {
  const f = fakeDeps({ sub_1: sub() });
  const e = ev("evt_b", "customer.subscription.updated", { id: "sub_1" });
  await handleBillingEvent(e, f.deps);
  const again = await handleBillingEvent(e, f.deps);
  assert.deepEqual(again, { handled: "duplicate" });
  assert.equal(f.retrieved, 1);
});
await check("events out of order: an old event still writes today's state", async () => {
  // Stripe sends "created (trialing)" after "deleted"; the re-read says canceled.
  const f = fakeDeps({ sub_1: sub({ status: "canceled", ended_at: unix("2027-03-01T10:00:00Z") }) });
  await handleBillingEvent(ev("evt_del", "customer.subscription.deleted", { id: "sub_1", status: "canceled" }), f.deps);
  await handleBillingEvent(ev("evt_old", "customer.subscription.created", { id: "sub_1", status: "trialing" }), f.deps);
  assert.equal(f.rows.length, 1);
  assert.equal(f.rows[0].row.status, "canceled");
});
await check("a failed payment marks the row past_due", async () => {
  const f = fakeDeps({ sub_1: sub({ status: "past_due", trial_end: null }) });
  await handleBillingEvent(ev("evt_f", "invoice.payment_failed", { id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } }), f.deps);
  assert.equal(f.rows[0].row.status, "past_due");
});
await check("a customer the card step didn't create is ignored, and finished", async () => {
  const f = fakeDeps({ sub_1: sub({ customer: "cus_stranger" }) });
  const r = await handleBillingEvent(ev("evt_s", "customer.subscription.updated", { id: "sub_1" }), f.deps);
  assert.deepEqual(r, { handled: "ignored", why: "unknown customer" });
  assert.equal(f.rows.length, 0);
  assert.equal(f.events.get("evt_s")?.done, true);
});
await check("metadata naming another account throws (500, Stripe retries; nothing written)", async () => {
  const f = fakeDeps({ sub_1: sub({ metadata: { user_id: "user_2" } }) });
  await assert.rejects(handleBillingEvent(ev("evt_m", "customer.subscription.updated", { id: "sub_1" }), f.deps));
  assert.equal(f.rows.length, 0);
  assert.equal(f.events.get("evt_m")?.done, false, "left unfinished so a retry handles it");
});
await check("a database error leaves the event unfinished, and the retry succeeds", async () => {
  const f = fakeDeps({ sub_1: sub() });
  const record = f.deps.record;
  let fail = true;
  f.deps.record = async (u, r) => { if (fail) throw new Error("db down"); return record(u, r); };
  const e = ev("evt_r", "customer.subscription.updated", { id: "sub_1" });
  await assert.rejects(handleBillingEvent(e, f.deps));
  fail = false;
  const r = await handleBillingEvent(e, f.deps);
  assert.equal(r.handled, "recorded");
  assert.equal(f.rows.length, 1);
});
await check("a non-Flock price is ignored, and finished", async () => {
  const f = fakeDeps({ sub_1: sub({ price: "price_something_else" }) });
  const r = await handleBillingEvent(ev("evt_p", "customer.subscription.updated", { id: "sub_1" }), f.deps);
  assert.equal(r.handled, "ignored");
  assert.equal(f.rows.length, 0);
});
await check("unrelated events are acknowledged without a read or a claim", async () => {
  const f = fakeDeps({});
  const r = await handleBillingEvent(ev("evt_x", "charge.refunded", { id: "ch_1" }), f.deps);
  assert.equal(r.handled, "ignored");
  assert.equal(f.retrieved, 0);
  assert.equal(f.events.size, 0);
});

// ── Promotion codes (backlog 1.17) ─────────────────────────────────────────
await check("promotion codes: regular plans yes, the founding price never", () => {
  assert.equal(promotionCodesAllowed("monthly"), true);
  assert.equal(promotionCodesAllowed("annual"), true);
  assert.equal(promotionCodesAllowed("founding"), false);
  assert.equal(promotionCodesAllowed(checkoutPlan("annual", true)), false, "a founder picking yearly still gets founding, so no code");
});
await check("discounts to remove: only a founding subscription's, ids or expanded", () => {
  assert.deepEqual(discountsToRemove("monthly", { discounts: ["di_1"] }), []);
  assert.deepEqual(discountsToRemove("founding", { discounts: [] }), []);
  assert.deepEqual(discountsToRemove("founding", { discounts: null }), []);
  assert.deepEqual(discountsToRemove("founding", {}), []);
  assert.deepEqual(discountsToRemove("founding", { discounts: ["di_1", { id: "di_2" }] }), ["di_1", "di_2"]);
});
await check("checkout offers the code field from the rule, after the plan is picked", () => {
  const src = readFileSync("src/lib/billing.functions.ts", "utf8");
  const plan = src.indexOf("const plan = checkoutPlan(");
  const allow = src.indexOf("allow_promotion_codes: promotionCodesAllowed(plan)");
  assert.ok(plan > 0 && allow > plan, "allow_promotion_codes follows promotionCodesAllowed(plan)");
  assert.doesNotMatch(src, /allow_promotion_codes: true/);
});
await check("a founding subscription with a discount: it's removed, then the row is recorded", async () => {
  const f = fakeDeps({ sub_1: sub({ price: "price_founding", discounts: ["di_1"] }) });
  const r = await handleBillingEvent(ev("evt_d", "customer.subscription.updated", { id: "sub_1" }), f.deps);
  assert.equal(r.handled, "recorded");
  assert.deepEqual(f.cleared, ["sub_1"]);
  assert.equal(f.rows[0].row.plan, "founding");
  assert.match(f.events.get("evt_d")?.outcome ?? "", /discount removed/);
});
await check("a regular subscription keeps its code; a founding one without a discount isn't touched", async () => {
  const f = fakeDeps({ sub_1: sub({ discounts: ["di_1"] }), sub_2: sub({ id: "sub_2", price: "price_founding", discounts: [] }) });
  await handleBillingEvent(ev("evt_k", "customer.subscription.updated", { id: "sub_1" }), f.deps);
  await handleBillingEvent(ev("evt_k2", "customer.subscription.updated", { id: "sub_2" }), f.deps);
  assert.deepEqual(f.cleared, []);
  assert.equal(f.rows.length, 2);
});
await check("a failed discount removal leaves the event unfinished (500, Stripe retries), nothing written", async () => {
  const f = fakeDeps({ sub_1: sub({ price: "price_founding", discounts: ["di_1"] }) });
  f.deps.removeDiscounts = async () => { throw new Error("stripe down"); };
  await assert.rejects(handleBillingEvent(ev("evt_df", "customer.subscription.updated", { id: "sub_1" }), f.deps));
  assert.equal(f.rows.length, 0);
  assert.equal(f.events.get("evt_df")?.done, false);
});
await check("an unknown customer's founding discount is left alone", async () => {
  const f = fakeDeps({ sub_1: sub({ customer: "cus_stranger", price: "price_founding", discounts: ["di_1"] }) });
  await handleBillingEvent(ev("evt_u", "customer.subscription.updated", { id: "sub_1" }), f.deps);
  assert.deepEqual(f.cleared, []);
});

// ── Native app and free-season rows ────────────────────────────────────────
await check("the card step reads the native flag after mount and never renders in the app", () => {
  const src = readFileSync("src/components/flock/BillingCardStep.tsx", "utf8");
  assert.match(src, /useEffect\(\(\) => setNative\(isNativeApp\(\)\)/);
  assert.match(src, /cardStep\(data, native !== false\)/, "hidden until the browser says it isn't the app");
});
await check("billing code never reads or writes free-season rows", () => {
  for (const f of ["src/lib/billing.functions.ts", "src/lib/billingWebhook.server.ts", "src/lib/billingWebhook.ts"]) {
    assert.doesNotMatch(readFileSync(f, "utf8"), /free_season['"]/, f);
  }
  const fns = readFileSync("src/lib/billing.functions.ts", "utf8");
  assert.match(fns, /\.eq\("source", "stripe"\)/);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
