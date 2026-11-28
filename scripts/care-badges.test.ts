/**
 * Care badges (backlog 1.13b).
 *
 *   npm run test:care-badges
 *
 * Pins src/lib/careBadges.ts (order, levels, which celebration), that every
 * badge and level has Brittany's art in both colors and sizes, that the
 * migration's badge list and levels match the code, that the switch starts
 * off, that care badge code never imports the Flock, and that the bird page
 * shows nothing badge-related unless the switch said yes. The database side is
 * supabase/checks/care_badges_checks.sql.
 *
 * Plain asserts, since the repo carries no test runner. Exits non-zero on
 * failure so it can gate a merge.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  CARE_BADGES, DAILY_CHECK_IN_DAYS, STEADY_SCALE_WEEKS, careCelebrationFor, careEarnedCount, careNextLevel, cleanCareBadges, planReadyFor,
} from "@/lib/careBadges";
import { CARE_ART_LEVELS, careBadgeArt } from "@/lib/badgeArt";
import { CARE_FEATURES } from "@/lib/careFeatures";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) {
    console.log(`  FAIL ${name}\n       ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
    process.exitCode = 1;
  }
}

const MIGRATION = readFileSync("supabase/migrations/20261128160000_care_badges.sql", "utf8");
const row = (badge: string, level: number, more: Record<string, unknown> = {}) => ({ badge, level, earned_at: "2026-11-28T15:00:00Z", unseen: true, at_launch: false, ...more });

console.log("Rules");
check("the set is the spec's four, in the mockup's order", () => {
  assert.deepEqual([...CARE_BADGES], ["steady_scale", "daily_check_in", "plan_ready", "sitter_ready"]);
});
check("levels are 4, 12 and 52 weeks, and 7 and 30 days", () => {
  assert.deepEqual([...STEADY_SCALE_WEEKS], [4, 12, 52]);
  assert.deepEqual([...DAILY_CHECK_IN_DAYS], [7, 30]);
});
check("rows come back in order with every badge, unknown ones dropped", () => {
  const list = cleanCareBadges([row("sitter_ready", 1), row("nope", 3), row("steady_scale", 12)]);
  assert.deepEqual(list.map((b) => [b.badge, b.level]), [["steady_scale", 12], ["daily_check_in", 0], ["plan_ready", 0], ["sitter_ready", 1]]);
  assert.equal(careEarnedCount(list), 2);
  assert.equal(list[1].unseen, false, "an unearned badge is never unseen");
  assert.deepEqual(cleanCareBadges(null).map((b) => b.level), [0, 0, 0, 0]);
});
check("two or more from history are one launch celebration", () => {
  const c = careCelebrationFor(cleanCareBadges([row("steady_scale", 52, { at_launch: true }), row("plan_ready", 1, { at_launch: true })]));
  assert.equal(c?.kind, "launch");
  assert.deepEqual(c?.badges.map((b) => b.badge), ["steady_scale", "plan_ready"]);
});
check("one from history, or anything later, is a Badge earned card each", () => {
  assert.equal(careCelebrationFor(cleanCareBadges([row("plan_ready", 1, { at_launch: true })]))?.kind, "new");
  const c = careCelebrationFor(cleanCareBadges([row("steady_scale", 12), row("sitter_ready", 1)]));
  assert.equal(c?.kind, "new");
  assert.equal(c?.badges.length, 2);
});
check("nothing to celebrate once everything is seen", () => {
  assert.equal(careCelebrationFor(cleanCareBadges([row("steady_scale", 12, { unseen: false })])), null);
});
check("the next level, and none at the top or without levels", () => {
  assert.equal(careNextLevel("steady_scale", 0), 4);
  assert.equal(careNextLevel("steady_scale", 4), 12);
  assert.equal(careNextLevel("steady_scale", 52), null);
  assert.equal(careNextLevel("daily_check_in", 7), 30);
  assert.equal(careNextLevel("plan_ready", 1), null);
});
check("Plan ready waits for the plan to load, then needs every section and a finished walkthrough", () => {
  assert.equal(planReadyFor({ loaded: false, todo: [] }, true), undefined);
  assert.equal(planReadyFor({ loaded: true, todo: [] }, true), true);
  assert.equal(planReadyFor({ loaded: true, todo: ["food"] }, true), false);
  assert.equal(planReadyFor({ loaded: true, todo: [] }, false), false);
});

console.log("Art");
check("every badge and level has its art, earned and unearned, both sizes", () => {
  for (const badge of CARE_BADGES) {
    const levels = CARE_ART_LEVELS[badge] ?? [1];
    for (const level of levels) {
      for (const size of ["lg", "sm"] as const) {
        for (const shown of [level, 0]) {
          const path = careBadgeArt(badge, shown === 0 ? 0 : level, size);
          if (shown === 0 && level !== levels[0]) continue;
          assert.ok(existsSync(`public${path}`), `missing ${path}`);
        }
      }
    }
  }
});
check("a level between steps shows the step reached", () => {
  assert.equal(careBadgeArt("steady_scale", 12), "/badges/care/earned/steady-scale-12-weeks-192.png");
  assert.equal(careBadgeArt("daily_check_in", 0, "sm"), "/badges/care/unearned/daily-check-in-7-days-64.png");
});

console.log("Database and switch");
check("the migration lists the same badges in the same order", () => {
  const m = /care_badge_ids\(\)[\s\S]*?select array\[([^\]]+)\]/.exec(MIGRATION);
  assert.ok(m, "no care_badge_ids in the migration");
  assert.deepEqual(m![1].split(",").map((s) => s.trim().replace(/'/g, "")), [...CARE_BADGES]);
  const constraint = /badge in \(([^)]+)\)/.exec(MIGRATION);
  assert.deepEqual(constraint![1].split(",").map((s) => s.trim().replace(/'/g, "")).sort(), [...CARE_BADGES].sort());
});
check("the migration's levels match the code's", () => {
  assert.match(MIGRATION, /'steady_scale', private\.care_badge_step\([^;]*array\[4, 12, 52\]\)/);
  assert.match(MIGRATION, /'daily_check_in', private\.care_badge_step\([^;]*array\[7, 30\]\)/);
});
check("care_badges starts off, in the code and the migration", () => {
  assert.deepEqual(CARE_FEATURES.find((f) => f.feature === "care_badges"), { feature: "care_badges", startsAt: "off" });
  assert.match(MIGRATION, /\('care_badges', 'off',/);
  assert.match(MIGRATION, /on conflict \(feature\) do nothing/);
});
check("the migration only adds: no drop, alter of an existing table, or change to a care table", () => {
  assert.ok(!/\bdrop (table|column|function|trigger)\b/i.test(MIGRATION));
  assert.ok(!/\balter table (?!public\.care_badge_(awards|syncs))/i.test(MIGRATION));
  assert.ok(!/\b(update|delete from|insert into) public\.(weight_entries|daily_logs|sits|sit_birds|birds|profiles|care_plans)\b/i.test(MIGRATION));
});

console.log("Free users");
check("care badge code never imports the Flock", () => {
  for (const f of ["src/lib/careBadges.ts", "src/components/CareBadgeParts.tsx", "src/routes/_authenticated/birds/$birdId.badges.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/from "@\/(lib\/flock|components\/flock)/.test(src), `${f} imports the Flock`);
  }
});
check("the badges are asked for only while the switch is on", () => {
  const lib = readFileSync("src/lib/careBadges.ts", "utf8");
  assert.match(lib, /useCareFeature\("care_badges"\)/);
  assert.match(lib, /enabled: on === true &&/);
});
check("the bird page shows badges and celebrations only when the switch gave it some", () => {
  const page = readFileSync("src/routes/_authenticated/birds/$birdId.index.tsx", "utf8");
  assert.match(page, /\{careBadges && !passed && <BirdBadgeCelebration /);
  assert.match(page, /\{careBadges && <BirdBadgesRow /);
  assert.match(page, /last=\{!careBadges\}/);
});
check("the Badges screen sends you back to the bird while the switch is off", () => {
  const screen = readFileSync("src/routes/_authenticated/birds/$birdId.badges.tsx", "utf8");
  assert.match(screen, /if \(on === false \|\| badges === null\) void toBird\(\)/);
});

console.log(`\n${passed} passed`);
