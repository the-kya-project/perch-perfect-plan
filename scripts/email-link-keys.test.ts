/**
 * Email links survive the cron-token rotation.
 *
 *   npm run test:email-link-keys
 *
 * Pins src/lib/emailLinkKeys.ts and the four link signers: new links are signed
 * with EMAIL_LINK_SECRET only; links signed with the old shared secret keep
 * verifying through EMAIL_LINK_LEGACY_SECRET until LEGACY_LINK_KEY_UNTIL, then
 * stop; CARE_PLAN_REMINDER_SECRET (now cron auth only) plays no part in links;
 * and with no key configured, verifying says "invalid" instead of throwing.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { LEGACY_LINK_KEY_UNTIL, linkVerifyingKeys } from "@/lib/emailLinkKeys";
import { unsubSig, unsubSigValid } from "@/lib/unsubscribe";
import { chartSig, chartSigValid } from "@/lib/chartLink";
import { reviewSig, reviewSigValid } from "@/lib/bereavementReview.server";
import { clickToken, readClickToken, type ClickPayload } from "@/lib/emailClicks.server";

let passed = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const OLD = "old-shared-secret-not-real";
const NEW = "new-email-link-secret-not-real";
const CRON = "new-cron-token-not-real";
const KEYS = ["EMAIL_LINK_SECRET", "EMAIL_LINK_LEGACY_SECRET", "CARE_PLAN_REMINDER_SECRET"] as const;
function setEnv(v: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) { if (v[k] === undefined) delete process.env[k]; else process.env[k] = v[k]; }
}

const USER = "11111111-1111-4111-8111-111111111111";
const BIRD = "22222222-2222-4222-8222-222222222222";
const REVIEW = "33333333-3333-4333-8333-333333333333";
const CLICK: ClickPayload = { u: USER, e: "monthly_letter", k: "cta", d: "https://app.thekyaproject.com/", t: 1 } as ClickPayload;

/** Links as an email sent BEFORE the split carries them: signed with the old
 *  shared value (which the old code read as CARE_PLAN_REMINDER_SECRET). */
async function oldLinks() {
  setEnv({ EMAIL_LINK_SECRET: OLD });
  return {
    unsub: unsubSig(USER, "monthly"),
    chart: chartSig(BIRD, "2026-09"),
    review: reviewSig(REVIEW),
    click: await clickToken(CLICK),
  };
}

(async () => {
  const old = await oldLinks();

  console.log("transition window (old value in EMAIL_LINK_LEGACY_SECRET, cron token rotated)");
  setEnv({ EMAIL_LINK_SECRET: NEW, EMAIL_LINK_LEGACY_SECRET: OLD, CARE_PLAN_REMINDER_SECRET: CRON });
  await check("old unsubscribe link still works", () => assert.ok(unsubSigValid(USER, "monthly", old.unsub)));
  await check("old chart image still loads", () => assert.ok(chartSigValid(BIRD, "2026-09", old.chart)));
  await check("old review link still works", () => assert.ok(reviewSigValid(REVIEW, old.review)));
  await check("old click link still logs", async () => assert.deepEqual(await readClickToken(old.click), CLICK));
  await check("new links are signed with EMAIL_LINK_SECRET only, and verify", async () => {
    const s = unsubSig(USER, "monthly");
    assert.notEqual(s, old.unsub);
    assert.ok(unsubSigValid(USER, "monthly", s));
    assert.ok(chartSigValid(BIRD, "2026-09", chartSig(BIRD, "2026-09")));
    assert.ok(reviewSigValid(REVIEW, reviewSig(REVIEW)));
    assert.deepEqual(await readClickToken(await clickToken(CLICK)), CLICK);
  });
  await check("a tampered signature is still rejected", () => {
    assert.equal(unsubSigValid(USER, "onboarding", old.unsub), false);
    assert.equal(chartSigValid(BIRD, "2026-10", old.chart), false);
  });

  console.log("cutoff");
  await check("the cutoff is 90 days after the split (2026-10-22)", () => {
    assert.equal(LEGACY_LINK_KEY_UNTIL - Date.parse("2026-10-22T00:00:00Z"), 90 * 86_400_000);
  });
  await check("before the cutoff both keys verify; on and after it only the new one", () => {
    assert.deepEqual(linkVerifyingKeys(LEGACY_LINK_KEY_UNTIL - 1), [NEW, OLD]);
    assert.deepEqual(linkVerifyingKeys(LEGACY_LINK_KEY_UNTIL), [NEW]);
  });

  console.log("misconfiguration");
  await check("without the legacy variable, old links stop verifying (new ones are fine)", () => {
    setEnv({ EMAIL_LINK_SECRET: NEW, CARE_PLAN_REMINDER_SECRET: OLD });
    assert.equal(unsubSigValid(USER, "monthly", old.unsub), false);
    assert.ok(unsubSigValid(USER, "monthly", unsubSig(USER, "monthly")));
  });
  await check("the cron token neither signs nor verifies links", async () => {
    setEnv({ CARE_PLAN_REMINDER_SECRET: OLD });
    assert.throws(() => unsubSig(USER, "monthly"), /EMAIL_LINK_SECRET is required/);
    assert.equal(unsubSigValid(USER, "monthly", old.unsub), false);
    assert.equal(await readClickToken(old.click), null);
  });
  await check("no keys at all (a preview): verifying says invalid, never throws", async () => {
    setEnv({});
    assert.equal(unsubSigValid(USER, "monthly", old.unsub), false);
    assert.equal(chartSigValid(BIRD, "2026-09", old.chart), false);
    assert.equal(reviewSigValid(REVIEW, old.review), false);
    assert.equal(await readClickToken(old.click), null);
  });

  console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
})();
