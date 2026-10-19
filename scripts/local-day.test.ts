/**
 * "Today" is the user's calendar day, not UTC's.
 *
 *   npm run test:local-day
 *
 * The health check, sitter tasks and sits used to stamp "today" with
 * toISOString().slice(0, 10), which flips to tomorrow at UTC midnight (5pm in
 * California). This pins the replacement in src/lib/localDay.ts: the device's
 * own date on the client, and on the server the client's date only when it is
 * within a day of UTC.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { localDateISO, resolveToday } from "@/lib/localDay";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

function inZone<T>(tz: string, fn: () => T): T {
  const prev = process.env.TZ;
  process.env.TZ = tz;
  try { return fn(); } finally { process.env.TZ = prev; }
}

const DAY = 86_400_000;
const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

check("an evening check in California stays on today", () => {
  // 7:30pm Oct 18 in Los Angeles is already Oct 19 in UTC.
  const at = new Date("2026-10-19T02:30:00Z");
  assert.equal(at.toISOString().slice(0, 10), "2026-10-19");
  assert.equal(inZone("America/Los_Angeles", () => localDateISO(at)), "2026-10-18");
});

check("a morning check in Sydney is already today there", () => {
  // 7am Oct 19 in Sydney is still Oct 18 in UTC.
  const at = new Date("2026-10-18T20:00:00Z");
  assert.equal(inZone("Australia/Sydney", () => localDateISO(at)), "2026-10-19");
});

check("UTC itself is unchanged", () => {
  assert.equal(inZone("UTC", () => localDateISO(new Date("2026-10-19T23:59:00Z"))), "2026-10-19");
});

check("the server accepts the client's day within a day of UTC", () => {
  const now = Date.now();
  for (const offset of [-DAY, 0, DAY]) {
    const d = utcDay(now + offset);
    assert.equal(resolveToday(d), d);
  }
});

check("the server falls back to UTC for a far-off or missing day", () => {
  const today = utcDay(Date.now());
  assert.equal(resolveToday(utcDay(Date.now() - 3 * DAY)), today);
  assert.equal(resolveToday(utcDay(Date.now() + 3 * DAY)), today);
  assert.equal(resolveToday(undefined), today);
  assert.equal(resolveToday(""), today);
});

check("the server ignores anything that isn't a plain date", () => {
  const today = utcDay(Date.now());
  assert.equal(resolveToday("tomorrow"), today);
  assert.equal(resolveToday(`${today}T00:00:00Z`), today);
  assert.equal(resolveToday("2026-13-45"), today);
});

console.log(`\n${passed} passed${process.exitCode ? " — WITH FAILURES" : ""}`);
