/**
 * Gift memberships — the parts that don't need a live Stripe account: webhook
 * signature verification (with Stripe's own library and a throwaway secret),
 * gift dates, the two emails (escaping, subject = headline, code present),
 * refunds (partial, several adding up, full) and the launch rule.
 *
 *   npm run test:gifts
 *
 * The end-to-end cases (a real test-mode purchase, a promo code, a refund,
 * redemption) run against the Vercel preview and staging; see the PR.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on failure.
 */
import assert from "node:assert/strict";
import Stripe from "stripe";
import { giftToday, isAllowedSendDate, formatGiftDate, formatCents, GIFT_CODE_PATTERN, applyGiftRefund, giftKeptCents, giftGivingCents, giftGrantsMembership } from "@/lib/gifts";
import { buildGiftReceiptEmail, buildGiftRecipientEmail, type GiftRow } from "@/lib/giftEmails.server";

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

// ── Webhook signature ────────────────────────────────────────────────────────
// A fake key and secret: constructEvent only does HMAC math, nothing is sent.
const stripe = new Stripe("sk_test_not_a_real_key");
const SECRET = "whsec_test_only_not_a_real_secret";
const payload = JSON.stringify({ id: "evt_test", object: "event", type: "checkout.session.completed", data: { object: { id: "cs_test_x" } } });
const header = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

await check("a correctly signed event verifies", async () => {
  const ev = await stripe.webhooks.constructEventAsync(payload, header, SECRET);
  assert.equal(ev.type, "checkout.session.completed");
});
await check("a tampered body is rejected", async () => {
  await assert.rejects(stripe.webhooks.constructEventAsync(payload.replace("cs_test_x", "cs_test_y"), header, SECRET));
});
await check("the wrong secret is rejected", async () => {
  await assert.rejects(stripe.webhooks.constructEventAsync(payload, header, "whsec_some_other_secret"));
});
await check("a garbage signature header is rejected", async () => {
  await assert.rejects(stripe.webhooks.constructEventAsync(payload, "t=1,v1=deadbeef", SECRET));
});
await check("an old signature is rejected (replay)", async () => {
  const old = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET, timestamp: Math.floor(Date.now() / 1000) - 3600 });
  await assert.rejects(stripe.webhooks.constructEventAsync(payload, old, SECRET));
});

// ── Dates ───────────────────────────────────────────────────────────────────
// 2026-12-02 03:00 UTC is still Dec 1 in Indianapolis (UTC-5).
await check("today is judged in Indianapolis", () => {
  assert.equal(giftToday(new Date("2026-12-02T03:00:00Z")), "2026-12-01");
  assert.equal(giftToday(new Date("2026-12-02T06:00:00Z")), "2026-12-02");
});
await check("send dates: today through Dec 31, 2026 only", () => {
  const now = new Date("2026-11-27T15:00:00Z");
  assert.equal(isAllowedSendDate("2026-11-27", now), true);
  assert.equal(isAllowedSendDate("2026-12-31", now), true);
  assert.equal(isAllowedSendDate("2026-11-26", now), false);
  assert.equal(isAllowedSendDate("2027-01-01", now), false);
  assert.equal(isAllowedSendDate("12/25/2026", now), false);
});
await check("dates and money format without timezone drift", () => {
  assert.equal(formatGiftDate("2026-12-24"), "Dec 24, 2026");
  assert.equal(formatCents(30000), "$300");
  assert.equal(formatCents(7900), "$79");
  assert.equal(formatCents(23920), "$239.20");
});
await check("the code pattern excludes 0, O, 1 and I", () => {
  assert.equal(GIFT_CODE_PATTERN.test("KYA-7H3Q-PX2M"), true);
  for (const bad of ["KYA-7H3Q-PX0M", "KYA-7H3Q-PXOM", "KYA-7H3Q-PX1M", "KYA-7H3Q-PXIM", "kya-7h3q-px2m"]) {
    assert.equal(GIFT_CODE_PATTERN.test(bad), false, bad);
  }
});

// ── Emails ──────────────────────────────────────────────────────────────────
const base: GiftRow = {
  id: "00000000-0000-4000-8000-000000000001",
  plan: "flock_year",
  buyer_email: "buyer@example.com",
  buyer_name: "Sam <b>Rivera</b>",
  recipient_name: "Jo <script>alert(1)</script>",
  recipient_email: "jo@example.com",
  message: "Happy holidays!\nLove to Juno & co. <img src=x onerror=alert(1)>",
  send_on: "2026-12-24",
  amount_paid_cents: 24000,
  promo_code: "BLACKFRIDAY26",
  giving_rate: 0.2,
  gift_code: "KYA-7H3Q-PX2M",
  status: "paid",
  buyer_emailed_at: null,
  recipient_emailed_at: null,
};

await check("receipt: subject is the headline, code and promo present", () => {
  const e = buildGiftReceiptEmail(base);
  assert.equal(e.subject, "Your gift is ready");
  assert.match(e.html, /<h1[^>]*>Your gift is ready<\/h1>/);
  assert.ok(e.html.includes("KYA-7H3Q-PX2M") && e.text.includes("KYA-7H3Q-PX2M"));
  assert.ok(e.html.includes("BLACKFRIDAY26"));
  assert.ok(e.html.includes("$240"));
  assert.ok(e.text.includes("20% of what you paid"));
});
await check("receipt: buyer-typed text is escaped", () => {
  const e = buildGiftReceiptEmail(base);
  assert.ok(!e.html.includes("<script>"), "script tag leaked");
  assert.ok(!e.html.includes("<img src=x"), "img tag leaked");
  assert.ok(e.html.includes("Jo &lt;script&gt;"));
});
await check("receipt: send-to-self wording when there's no recipient email", () => {
  const e = buildGiftReceiptEmail({ ...base, recipient_email: null, send_on: null });
  assert.ok(e.text.includes("print this email, forward it"));
  assert.ok(!e.text.includes("We'll email the gift"));
});
await check("recipient: subject is the headline, redeem link carries the code", () => {
  const e = buildGiftRecipientEmail(base);
  assert.equal(e.subject, "You've been given a gift");
  assert.ok(e.html.includes("/redeem?code=KYA-7H3Q-PX2M"));
  assert.ok(!e.html.includes("<script>") && !e.html.includes("<b>Rivera"));
});
await check("recipient: app premium wording and a nameless buyer", () => {
  const e = buildGiftRecipientEmail({ ...base, plan: "app_premium_year", buyer_name: null, message: null });
  assert.ok(e.text.includes("a year of app premium"));
  assert.ok(e.text.includes("Someone who cares about you and your bird"));
  assert.ok(e.text.includes("when app premium launches in January"));
});
await check("both emails carry the PO Box and no unsubscribe link", () => {
  for (const e of [buildGiftReceiptEmail(base), buildGiftRecipientEmail(base)]) {
    assert.ok(e.html.includes("PO Box 58, New Haven, IN 46774"));
    assert.ok(!/unsubscribe/i.test(e.html));
  }
});

// ── Refunds ─────────────────────────────────────────────────────────────────
// Stripe's charge.amount_refunded is the running total, so each event carries
// the sum of every refund so far.
const paid249 = { status: "paid", amountPaidCents: 24900, amountRefundedCents: 0 };

await check("one partial refund: recorded, gift stays valid", () => {
  const r = applyGiftRefund(paid249, { amountRefundedCents: 1000, fullyRefunded: false });
  assert.deepEqual(r, { status: "paid", amountRefundedCents: 1000, becameRefunded: false, changed: true });
  const g = { status: r.status, amount_paid_cents: 24900, amount_refunded_cents: r.amountRefundedCents, giving_rate: 0.2 };
  assert.equal(giftKeptCents(g), 23900);
  assert.equal(giftGivingCents(g), 4780);
});
await check("a partial refund on a redeemed gift keeps it redeemed", () => {
  const r = applyGiftRefund({ ...paid249, status: "redeemed" }, { amountRefundedCents: 1000, fullyRefunded: false });
  assert.equal(r.status, "redeemed");
  assert.equal(r.amountRefundedCents, 1000);
});
await check("two partials adding up to the full amount: refunded", () => {
  const first = applyGiftRefund(paid249, { amountRefundedCents: 9900, fullyRefunded: false });
  assert.equal(first.status, "paid");
  const after = { status: first.status, amountPaidCents: 24900, amountRefundedCents: first.amountRefundedCents };
  // Stripe marks the charge refunded once the total reaches the amount...
  const second = applyGiftRefund(after, { amountRefundedCents: 24900, fullyRefunded: true });
  assert.deepEqual(second, { status: "refunded", amountRefundedCents: 24900, becameRefunded: true, changed: true });
  // ...and reaching it counts even without that flag.
  assert.equal(applyGiftRefund(after, { amountRefundedCents: 24900, fullyRefunded: false }).status, "refunded");
  assert.equal(giftKeptCents({ status: "refunded", amount_paid_cents: 24900, amount_refunded_cents: 24900 }), 0);
});
await check("a full refund: refunded, nothing kept, nothing given", () => {
  const r = applyGiftRefund({ status: "paid", amountPaidCents: 30000, amountRefundedCents: 0 }, { amountRefundedCents: 30000, fullyRefunded: true });
  assert.deepEqual(r, { status: "refunded", amountRefundedCents: 30000, becameRefunded: true, changed: true });
  const g = { status: "refunded", amount_paid_cents: 30000, amount_refunded_cents: 30000, giving_rate: 0.2 };
  assert.equal(giftKeptCents(g), 0);
  assert.equal(giftGivingCents(g), 0);
});
await check("refunds only go up: a late, older event changes nothing", () => {
  const r = applyGiftRefund({ status: "paid", amountPaidCents: 24900, amountRefundedCents: 5000 }, { amountRefundedCents: 1000, fullyRefunded: false });
  assert.equal(r.amountRefundedCents, 5000);
  assert.equal(r.changed, false);
  const done = applyGiftRefund({ status: "refunded", amountPaidCents: 24900, amountRefundedCents: 24900 }, { amountRefundedCents: 1000, fullyRefunded: false });
  assert.deepEqual(done, { status: "refunded", amountRefundedCents: 24900, becameRefunded: false, changed: false });
});
await check("a redelivered event changes nothing", () => {
  const once = { status: "paid", amountPaidCents: 24900, amountRefundedCents: 1000 };
  assert.equal(applyGiftRefund(once, { amountRefundedCents: 1000, fullyRefunded: false }).changed, false);
});
await check("giving is on what was kept, at 40% on Giving Tuesday", () => {
  assert.equal(giftGivingCents({ status: "paid", amount_paid_cents: 24900, amount_refunded_cents: 1000, giving_rate: 0.4 }), 9560);
  assert.equal(giftGivingCents({ status: "redeemed", amount_paid_cents: 30000, amount_refunded_cents: 0, giving_rate: 0.4 }), 12000);
});

// ── Launch rule ─────────────────────────────────────────────────────────────
await check("launch rule: only status 'redeemed' grants membership", () => {
  assert.equal(giftGrantsMembership({ status: "redeemed" }), true);
  assert.equal(giftGrantsMembership({ status: "paid" }), false);
  assert.equal(giftGrantsMembership({ status: null }), false);
});
await check("launch rule: a refunded gift with a redeemer recorded does NOT grant membership", () => {
  const refundedAfterRedeeming = {
    status: "refunded",
    redeemed_by: "00000000-0000-4000-8000-0000000000aa",
    redeemed_at: "2026-11-06T17:10:00Z",
    refunded_at: "2026-11-06T17:19:05Z",
  };
  assert.equal(giftGrantsMembership(refundedAfterRedeeming), false);
});

console.log(`\n${passed} passed`);
