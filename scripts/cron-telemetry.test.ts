// What the scheduled jobs send to PostHog: a summary of each hook's result,
// never the people in it (cronTelemetry.ts, summarizeCronResult).
import assert from "node:assert/strict";
import { summarizeCronResult } from "@/lib/cronTelemetry";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`ok - ${name}`); } catch (e) { failed++; console.error(`not ok - ${name}\n`, e); }
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

check("monthly letter: counts survive, the skipped emails don't", () => {
  const out = summarizeCronResult({
    ok: true, mode: "dry-run", considered: 3, sent: 1, failed: 0,
    planned: [{ email: "dana@example.com", birds: 2, allQuiet: false, subject: "Kiwi's October" }],
    skipped: ["sam@example.com: already sent", "lee@example.com: no living birds"],
  });
  assert.deepEqual(out, { ok: true, mode: "dry-run", considered: 3, sent: 1, failed: 0, planned_count: 1, skipped_count: 2 });
  assert.ok(!EMAIL.test(JSON.stringify(out)));
});
check("onboarding audit: the accounts list becomes a count", () => {
  const out = summarizeCronResult({ ok: true, audit: "no_bird", count: 1, accounts: [{ email: "x@example.com", name: "X" }] });
  assert.deepEqual(out, { ok: true, audit: "no_bird", count: 1, accounts_count: 1 });
});
check("nested counts are kept one level down", () => {
  const out = summarizeCronResult({ ok: true, sent: { welcome: 2, journal: 1 }, deep: { a: { b: 1 } } });
  assert.deepEqual(out, { ok: true, sent: { welcome: 2, journal: 1 }, deep: {} });
});
check("an error message is kept but scrubbed", () => {
  const out = summarizeCronResult({ ok: false, error: "send failed for dana@example.com" });
  assert.equal(out.error, "send failed for [email]");
});
check("free text is dropped; short tokens are kept", () => {
  const out = summarizeCronResult({ start: "2026-10-26T15:00:00.000Z", note: "Dana Visser has 2 birds", logic: "one-system" });
  assert.deepEqual(out, { start: "2026-10-26T15:00:00.000Z", logic: "one-system" });
});

if (failed) process.exit(1);
