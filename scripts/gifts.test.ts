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
import { giftToday, giftLastSendDate, GIFT_SEND_WINDOW_DAYS, isAllowedSendDate, formatGiftDate, formatCents, GIFT_CODE_PATTERN, GIFT_PLANS, isGiftPlan, applyGiftRefund, giftKeptCents, giftGivingCents, giftGrantsMembership } from "@/lib/gifts";
import { buildGiftReceiptEmail, buildGiftRecipientEmail, type GiftRow } from "@/lib/giftEmails.server";
import { giftGivingNote, giftPlanName, giftPriceParts, giftRedeemed, giftRefundNote, giftTiming } from "@/lib/giftCopy";
import { readFileSync } from "node:fs";
import type { TFunction } from "i18next";

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
await check("send dates: a rolling window from today through 90 days ahead", () => {
  assert.equal(GIFT_SEND_WINDOW_DAYS, 90);
  const now = new Date("2026-11-27T15:00:00Z"); // Nov 27 in Indianapolis
  assert.equal(giftLastSendDate(now), "2027-02-25"); // Nov 27 + 90 days
  assert.equal(isAllowedSendDate("2026-11-27", now), true, "today");
  assert.equal(isAllowedSendDate("2026-12-31", now), true, "the old fixed last day is just a normal day now");
  assert.equal(isAllowedSendDate("2027-01-01", now), true, "past the old Dec 31 limit");
  assert.equal(isAllowedSendDate("2027-02-25", now), true, "just inside: day 90");
  assert.equal(isAllowedSendDate("2027-02-26", now), false, "just outside: day 91");
  assert.equal(isAllowedSendDate("2026-11-26", now), false, "yesterday");
  assert.equal(isAllowedSendDate("12/25/2026", now), false, "wrong format");
  assert.equal(isAllowedSendDate("2026-12-32", now), false, "not a real day");
  assert.equal(isAllowedSendDate("2027-02-30", now), false, "not a real day");
});
await check("send dates: the window rolls forward and is judged in Indianapolis, across a year end and daylight saving", () => {
  // 03:00 UTC on Dec 2 is still Dec 1 in Indianapolis, so the window starts Dec 1.
  const late = new Date("2026-12-02T03:00:00Z");
  assert.equal(giftLastSendDate(late), "2027-03-01");
  assert.equal(isAllowedSendDate("2026-12-01", late), true);
  assert.equal(isAllowedSendDate("2027-03-02", late), false);
  // Across the spring clock change (Mar 14, 2027) the count stays 90 calendar days.
  assert.equal(giftLastSendDate(new Date("2027-02-01T17:00:00Z")), "2027-05-02");
});
await check("send dates: the server checks the date itself, and says when the date is the problem", () => {
  const server = readFileSync("src/lib/gifts.functions.ts", "utf8");
  assert.ok(/if \(!d\.sendOn \|\| !isAllowedSendDate\(d\.sendOn\)\)/.test(server), "createGiftCheckout validates sendOn with isAllowedSendDate on the server");
  assert.ok(server.includes('reason: onlyDate ? "invalid_date" : "invalid"'), "a bad date alone returns invalid_date");
  const page = readFileSync("src/routes/gift.index.tsx", "utf8");
  assert.ok(page.includes('res.reason === "invalid_date"'), "the page shows the server's date refusal on the date field");
  assert.ok(!/December 31|GIFT_SEND_LAST_DATE/.test(page + readFileSync("src/lib/gifts.ts", "utf8")), "no fixed last day left");
});
await check("send-date copy: complete sentences, no fixed date", () => {
  const en = readFileSync("src/locales/en.jsonc", "utf8");
  assert.ok(en.includes('"gift.errDate": "That date is outside the window. Pick a day from today through {{last}}, which is {{days}} days ahead."'));
  assert.ok(en.includes('"gift.sendOnHint": "You can pick any day from today up to {{days}} days ahead. The email arrives that morning, Eastern time."'));
  const page = readFileSync("src/routes/gift.index.tsx", "utf8");
  assert.ok(page.includes('"That date is outside the window. Pick a day from today through {{last}}, which is {{days}} days ahead."'), "page fallback matches en.jsonc");
  assert.ok(page.includes('"You can pick any day from today up to {{days}} days ahead. The email arrives that morning, Eastern time."'), "page fallback matches en.jsonc");
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
await check("recipient: a nameless buyer, and no app premium wording (app premium is gone)", () => {
  const e = buildGiftRecipientEmail({ ...base, buyer_name: null, message: null });
  assert.ok(e.text.includes("a year in the Flock"));
  assert.ok(e.text.includes("Someone who cares about you and your bird"));
  assert.ok(!/premium/i.test(e.text) && !/premium/i.test(e.html));
  assert.ok(!/premium/i.test(buildGiftReceiptEmail(base).text));
});
// The fallbacks are what /gift and /redeem show (en.jsonc must match them).
const fakeT = ((_k: string, def: string, o?: Record<string, string>) =>
  def.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => o?.[k] ?? "")) as unknown as TFunction;

await check("gift copy: the start rule in words, no fixed end dates, never expires", () => {
  const year = giftTiming(fakeT, "flock_year"), half = giftTiming(fakeT, "flock_half_year");
  const rule = "While the Flock is still free for everyone, a gift redeemed then starts when the free season ends, so none of it goes unused.";
  // The gift page and gift emails (approved Nov 22): one sentence for the length, one for the start rule.
  const pageRule = "If it's redeemed while the Flock is still free for everyone, it starts when the free season ends, so none of it goes unused.";
  assert.ok(year.includes("A gift membership starts the day it's redeemed and runs for a year.") && year.includes(pageRule) && year.includes("Gifts never expire"));
  assert.ok(half.includes("A gift membership starts the day it's redeemed and runs for six months.") && half.includes(pageRule) && half.includes("Gifts never expire"));
  assert.ok(giftRedeemed(fakeT, "flock_year").includes("runs for a year") && giftRedeemed(fakeT, "flock_year").includes(rule));
  assert.ok(giftRedeemed(fakeT, "flock_half_year").includes("run for six months") && giftRedeemed(fakeT, "flock_half_year").includes(rule));
  for (const txt of [year, half, giftRedeemed(fakeT, "flock_year"), giftRedeemed(fakeT, "flock_half_year")]) {
    assert.ok(!/2028|runs through|run through/.test(txt), txt);
  }
  assert.equal(giftPlanName(fakeT, "flock_half_year"), "The Flock, six months");
  assert.equal(giftPlanName(fakeT, "flock_year"), "The Flock, one year");
  assert.ok(giftRefundNote(fakeT).includes("full refund within 30 days"));
  assert.ok(giftGivingNote(fakeT).includes("20% of every gift") && giftGivingNote(fakeT).includes("40% on double-giving days"));
});

await check("gift prices: $150 and $300, each 'That's $25 a month, paid once.'", () => {
  assert.deepEqual(giftPriceParts(fakeT, "flock_half_year", 15000), { price: "$150", perMonth: "That's $25 a month, paid once." });
  assert.deepEqual(giftPriceParts(fakeT, "flock_year", 30000), { price: "$300", perMonth: "That's $25 a month, paid once." });
});

await check("gift copy: no 'opens in January' or six free months anywhere (app, emails, pages)", () => {
  const files = ["src/locales/en.jsonc", "src/locales/emails.en.jsonc", "src/lib/giftCopy.ts", "src/routes/gift.index.tsx", "src/routes/gift.thanks.tsx", "src/routes/redeem.tsx", "src/routes/_authenticated/admin.gifts.tsx"];
  for (const f of files) {
    const txt = readFileSync(f, "utf8");
    assert.ok(!/opens in January|launches in January|six free months|first six months|six months free|6 months free/i.test(txt), f);
  }
  const en = readFileSync("src/locales/en.jsonc", "utf8");
  for (const [k, plan] of [["gift.timingFlock", "flock_year"], ["gift.timingFlockHalf", "flock_half_year"]] as const) {
    assert.ok(en.includes(`"${k}": "${giftTiming(fakeT, plan)}"`), `en.jsonc ${k} matches the fallback`);
  }
  for (const [k, plan] of [["redeem.doneFlock", "flock_year"], ["redeem.doneFlockHalf", "flock_half_year"]] as const) {
    assert.ok(en.includes(`"${k}": "${giftRedeemed(fakeT, plan)}"`), `en.jsonc ${k} matches the fallback`);
  }
});

await check("emails: each says which gift it is and the start rule, with no fixed end date; the receipt has the 30-day refund", () => {
  for (const [plan, gift, length] of [
    ["flock_year", "A year in the Flock", "runs for a year"],
    ["flock_half_year", "Six months in the Flock", "runs for six months"],
  ] as const) {
    const receipt = buildGiftReceiptEmail({ ...base, plan }).text, recipient = buildGiftRecipientEmail({ ...base, plan }).text;
    for (const txt of [receipt, recipient]) {
      assert.ok(txt.includes(gift), `${plan}: ${gift}`);
      assert.ok(txt.includes(length) && txt.includes("starts when the free season ends, so none of it goes unused"), `${plan}: rule`);
      assert.ok(!/2028|Runs:|runs through|run through|opens in January/.test(txt), `${plan}: no fixed end date`);
    }
    assert.ok(receipt.includes("full refund within 30 days"));
    assert.ok(recipient.includes("It's free for everyone while we're getting started.") && !/January|July 6/.test(recipient), `${plan}: no fixed opening or free-season date`);
  }
  assert.ok(buildGiftRecipientEmail({ ...base, plan: "flock_half_year" }).text.includes("six months in the Flock"));
});

await check("no fixed gift end dates anywhere in the copy (pages, emails, locales)", () => {
  for (const f of ["src/locales/en.jsonc", "src/locales/emails.en.jsonc", "src/lib/giftCopy.ts", "src/lib/giftEmails.server.ts", "src/routes/gift.index.tsx", "src/routes/gift.thanks.tsx", "src/routes/redeem.tsx"]) {
    const txt = readFileSync(f, "utf8");
    assert.ok(!/January 6, 2028|July 6, 2028|Jan 6, 2028|Jul 6, 2028/.test(txt), f);
  }
});

await check("gifts are six months or a year in the Flock, six months first", () => {
  assert.deepEqual([...GIFT_PLANS], ["flock_half_year", "flock_year"]);
  assert.equal(isGiftPlan("flock_half_year"), true);
  assert.equal(isGiftPlan("app_premium_year"), false);
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
