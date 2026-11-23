/**
 * The weekly recap push (backlog D5.1).
 *
 *   npm run test:weekly-recap
 *
 * Pins src/lib/weeklyRecap.ts (the switch, who it covers, when a recap is due,
 * the quiet-week limit), the push copy in English and Dutch (counts only, no
 * health words), and that the switch starts off, so the old 10- and 30-day
 * check-ins keep running unchanged until Brittany turns it on.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  DEFAULT_RECAP_TEST_EMAILS, RECAP_QUIET_MAX,
  inRecapWindow, isQuietWeek, planRecap, recapOnFor, recapTestEmails, weeklyRecapMode,
  type RecapInput,
} from "@/lib/weeklyRecap";
import { weeklyRecapPush } from "@/lib/pushCopy.server";
import { parseJsonc } from "@/lib/i18n/jsonc";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const DAY = 86_400_000;
// Sunday Nov 29 2026, 16:00 UTC (the daily run's time).
const SUNDAY = Date.UTC(2026, 10, 29, 16);
const none = { weighIns: 0, healthChecks: 0, journalEntries: 0 };
const busy = { weighIns: 3, healthChecks: 5, journalEntries: 1 };
const base: RecapInput = { now: SUNDAY, lastActivityAt: SUNDAY - DAY, lastRecapAt: 0, recapsSinceActivity: 0, counts: busy };

await check("the switch is off unless it says test or everyone", () => {
  for (const v of [undefined, null, "", "off", "on", "true", "1", "admins", "Everyone please"]) {
    assert.equal(weeklyRecapMode(v as string | undefined), "off", String(v));
  }
  assert.equal(weeklyRecapMode("test"), "test");
  assert.equal(weeklyRecapMode(" Everyone "), "everyone");
});

await check("off covers nobody; test covers only the listed addresses; everyone covers all", () => {
  const list = recapTestEmails(undefined);
  assert.deepEqual(list, DEFAULT_RECAP_TEST_EMAILS);
  assert.equal(recapOnFor("off", "brittany@thekyaproject.com", list), false);
  assert.equal(recapOnFor("test", "Brittany@TheKyaProject.com ", list), true);
  assert.equal(recapOnFor("test", "someone@example.com", list), false);
  assert.equal(recapOnFor("test", null, list), false);
  assert.equal(recapOnFor("everyone", null, list), true);
  assert.deepEqual(recapTestEmails(" a@x.com, B@y.com ,nonsense"), ["a@x.com", "b@y.com"]);
});

await check("the hook reads the switch from WEEKLY_RECAP, and recapPreview only in a dry run", () => {
  const src = readFileSync("src/routes/api/public/hooks/engagement-nudges.ts", "utf8");
  assert.ok(src.includes('dryRun && body.recapPreview === true ? "everyone" : weeklyRecapMode(process.env.WEEKLY_RECAP)'));
  // The old check-in branch is still there for accounts the recap doesn't cover.
  assert.ok(src.includes('type: "checkin_reminder"'));
  assert.ok(src.includes("if (recapUsers.has(userId))"));
});

await check("a recap goes out on Sunday, or Monday/Tuesday as catch-up, never other days", () => {
  for (let d = 0; d < 7; d++) {
    const now = SUNDAY + d * DAY;
    const plan = planRecap({ ...base, now, lastActivityAt: now - DAY });
    assert.equal(!!plan, d <= 2, `day ${d}`);
  }
});

await check("at most one a week: none within 4 days of the last", () => {
  assert.equal(planRecap({ ...base, now: SUNDAY + DAY, lastRecapAt: SUNDAY }), null);
  assert.equal(planRecap({ ...base, now: SUNDAY + 2 * DAY, lastRecapAt: SUNDAY - DAY }), null);
  assert.ok(planRecap({ ...base, lastRecapAt: SUNDAY - 7 * DAY }));
  // Sent Tuesday last week (catch-up), due again this Sunday.
  assert.ok(planRecap({ ...base, lastRecapAt: SUNDAY - 5 * DAY }));
});

await check("never-active accounts get nothing (the onboarding series covers them)", () => {
  assert.equal(planRecap({ ...base, lastActivityAt: 0, counts: none }), null);
});

await check("a busy week is a 'week' recap with its counts", () => {
  assert.deepEqual(planRecap(base), { kind: "week", counts: busy });
});

await check(`quiet weeks: ${RECAP_QUIET_MAX} in a row, then silence until the owner is back`, () => {
  const quiet = { ...base, lastActivityAt: SUNDAY - 20 * DAY, counts: none };
  assert.equal(isQuietWeek(none), true);
  assert.deepEqual(planRecap({ ...quiet, recapsSinceActivity: 0 }), { kind: "quiet", counts: none });
  assert.deepEqual(planRecap({ ...quiet, recapsSinceActivity: 1 }), { kind: "quiet", counts: none });
  assert.equal(planRecap({ ...quiet, recapsSinceActivity: 2 }), null);
  // Logging anything makes it a normal week again.
  assert.equal(planRecap({ ...quiet, recapsSinceActivity: 2, counts: { ...none, journalEntries: 1 } })?.kind, "week");
});

await check("the week is the 7 days ending at the run", () => {
  assert.equal(inRecapWindow(SUNDAY - 1, SUNDAY), true);
  assert.equal(inRecapWindow(SUNDAY - 7 * DAY + 1, SUNDAY), true);
  assert.equal(inRecapWindow(SUNDAY - 7 * DAY, SUNDAY), false);
  assert.equal(inRecapWindow(SUNDAY + 1, SUNDAY), false);
});

await check("English copy: one bird, several birds, singular and plural, quiet", () => {
  assert.deepEqual(weeklyRecapPush("en", ["Kiwi"], "week", busy), {
    title: "Kiwi's week",
    body: "This week: 3 weigh-ins, 5 health checks and 1 journal entry. Thanks for keeping the record going.",
  });
  assert.deepEqual(weeklyRecapPush("en", ["Kiwi", "Mango"], "week", { ...none, weighIns: 1, healthChecks: 2 }), {
    title: "Your flock's week",
    body: "This week: 1 weigh-in and 2 health checks. Thanks for keeping the record going.",
  });
  assert.equal(weeklyRecapPush("en", ["Kiwi"], "week", { ...none, journalEntries: 4 }).body,
    "This week: 4 journal entries. Thanks for keeping the record going.");
  assert.deepEqual(weeklyRecapPush("en", ["Kiwi"], "quiet", none), {
    title: "Kiwi's week",
    body: "A quiet week for Kiwi. A quick weigh-in or health check keeps the record whole.",
  });
  assert.equal(weeklyRecapPush("en", [null], "quiet", none).title, "Your bird's week");
  assert.equal(weeklyRecapPush(undefined, ["Kiwi", "Mango"], "quiet", none).body,
    "A quiet week for your flock. A quick weigh-in or health check keeps the record whole.");
});

await check("Dutch copy", () => {
  assert.deepEqual(weeklyRecapPush("nl", ["Kiwi"], "week", busy), {
    title: "De week van Kiwi",
    body: "Deze week: 3 wegingen, 5 gezondheidschecks en 1 dagboeknotitie. Fijn dat je het dossier bijhoudt.",
  });
  assert.equal(weeklyRecapPush("nl", ["Kiwi", "Mango"], "quiet", none).title, "De week van je vogels");
});

await check("the copy carries no health judgments: no weights, trends or results", () => {
  const en = parseJsonc(readFileSync("src/locales/emails.en.jsonc", "utf8")) as Record<string, string>;
  const keys = Object.keys(en).filter((k) => k.startsWith("push.weeklyRecap."));
  assert.equal(keys.length, 13);
  const banned = /\b(gram|grams|g\b|weight (?:is|was)|lost|gained|drop|dropped|trend|healthy|unwell|sick|concern|vet|normal|great job|well done)\b/i;
  for (const k of keys) assert.ok(!banned.test(en[k]), `${k}: ${en[k]}`);
});

await check("every recap key has Dutch with the same placeholders, and is stamped", () => {
  const en = parseJsonc(readFileSync("src/locales/emails.en.jsonc", "utf8")) as Record<string, string>;
  const nl = parseJsonc(readFileSync("src/locales/emails.nl.jsonc", "utf8")) as Record<string, string>;
  const meta = JSON.parse(readFileSync("src/locales/.i18n-meta.emails.json", "utf8")) as { keys: Record<string, { stamp: string }> };
  const config = JSON.parse(readFileSync("src/locales/i18n.config.json", "utf8")) as { register: string; glossaryVersion: number };
  const stamp = (v: string) =>
    createHash("sha256").update(`${v} ${config.register} ${config.glossaryVersion}`).digest("hex").slice(0, 16);
  const ph = (s: string) => (s.match(/\{\{[^}]+\}\}/g) ?? []).sort().join(",");
  const expected: Record<string, { stamp: string }> = {};
  for (const k of Object.keys(en).filter((key) => key.startsWith("push.weeklyRecap."))) {
    assert.ok(nl[k], `no Dutch for ${k}`);
    assert.equal(ph(nl[k]), ph(en[k]), `placeholders differ in ${k}`);
    expected[k] = { stamp: stamp(en[k]) };
  }
  const actual = Object.fromEntries(Object.keys(expected).map((k) => [k, meta.keys[k]]));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) console.log(JSON.stringify(expected, null, 2));
  assert.deepEqual(actual, expected, "stamps in .i18n-meta.emails.json are missing or stale (expected values above)");
});

console.log(`\n${passed} passed`);
