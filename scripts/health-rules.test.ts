// The health rules file (src/lib/healthRules.ts) is the one list of health
// values: every one has a review status and a source, the app's code agrees with
// it, and the database check (supabase/checks/health_rules_checks.sql) holds
// the same values, so a database that disagrees fails "Database checks".
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as rules from "@/lib/healthRules";
import {
  DIET_WEIGHT_RULES,
  VET_SIGNS_TODAY,
  VET_SIGNS_URGENT,
  NECTAR_EATER_PATTERN,
  DIET_STARTING_WEEK_DAYS,
  ECLECTUS_PATTERN,
  FIND_A_VET_URL,
  TRIAGE_RULES,
  CARE_WEIGHT_RULES,
  EMERGENCY_RULES,
  HEALTH_WORDING,
  DRAFT,
  APPROVED,
  type HealthRule,
} from "@/lib/healthRules";
import { HEALTH_FEATURES } from "@/lib/healthFeatures";
import { isEclectus } from "@/lib/journeys";
import { SCAN_FIELDS, computeTriage, type ScanAnswer, type ScanFieldKey } from "@/lib/triage";
import { computeWeightTrend, weightTrendPill } from "@/lib/weightTrend";
import { bigWeightChange } from "@/lib/dailyLog";
import { AAV_FIND_A_VET_URL } from "@/lib/flockPosts";
import { defaultPoisonLines, warmRange } from "@/lib/poisonControl";

let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (e) {
    failed++;
    console.error(`not ok - ${name}\n`, e);
  }
}

function isRule(v: unknown): v is HealthRule<unknown> {
  return !!v && typeof v === "object" && "value" in v && "status" in v && "source" in v;
}
function allRules(): [string, HealthRule<unknown>][] {
  const out: [string, HealthRule<unknown>][] = [];
  for (const [name, v] of Object.entries(rules)) {
    if (isRule(v)) out.push([name, v]);
    else if (v && typeof v === "object") {
      for (const [k, r] of Object.entries(v)) if (isRule(r)) out.push([`${name}.${k}`, r]);
    }
  }
  return out;
}

// The SQL check's expected values, read from the file.
const sqlCheck = readFileSync("supabase/checks/health_rules_checks.sql", "utf8");
function sqlLiteral(name: string): string {
  const m = sqlCheck.match(new RegExp(`^\\s*${name} (?:jsonb|text) := '(.*)';$`, "m"));
  assert.ok(m, `${name} in health_rules_checks.sql`);
  return m[1].replace(/''/g, "'");
}
const sorted = (a: readonly string[]) => [...a].sort();

// Brittany reviewed the live features herself (Nov 23, 2026). Everything else
// stays a draft, so nothing can become "approved" by accident.
const APPROVED_BY_BRITTANY = [
  /^TRIAGE_RULES\./,
  /^CARE_WEIGHT_RULES\./,
  /^EMERGENCY_RULES\./,
  /^HEALTH_WORDING\.(dailyHealthCheck|weight|emergencyGuides|passingGuidance)$/,
];

check("every rule has the right status, a source and where it's used", () => {
  const all = allRules();
  assert.ok(all.length >= 30, `found ${all.length} rules`);
  for (const [name, r] of all) {
    const expected = APPROVED_BY_BRITTANY.some((re) => re.test(name)) ? APPROVED : DRAFT;
    assert.equal(r.status, expected, name);
    assert.ok(r.source.trim().length > 0, `${name} has a source`);
    assert.ok(r.where.trim().length > 0, `${name} says where it's used`);
  }
});

check("the database check holds the file's diet weight rules", () => {
  const sql = JSON.parse(sqlLiteral("expected_diet")) as Record<string, number>;
  const file = Object.fromEntries(Object.entries(DIET_WEIGHT_RULES).map(([k, r]) => [k, r.value]));
  assert.deepEqual(sql, file);
});

check("the database check holds the file's vet-nudge phrases", () => {
  assert.deepEqual(sorted(JSON.parse(sqlLiteral("expected_today"))), sorted(VET_SIGNS_TODAY.value));
  assert.deepEqual(
    sorted(JSON.parse(sqlLiteral("expected_urgent"))),
    sorted(VET_SIGNS_URGENT.value),
  );
});

check("no vet-nudge phrase is listed twice or in both tiers", () => {
  const all = [...VET_SIGNS_TODAY.value, ...VET_SIGNS_URGENT.value];
  assert.equal(new Set(all).size, all.length);
  for (const p of all) assert.equal(p, p.toLowerCase().trim(), p);
});

check("the database check holds the file's nectar-eater pattern", () => {
  assert.equal(sqlLiteral("expected_nectar"), NECTAR_EATER_PATTERN.value);
});

check("Diet conversion's starting week is the file's number of days", () => {
  const migration = readFileSync(
    "supabase/migrations/20261125030000_diet_starting_weight.sql",
    "utf8",
  );
  assert.ok(
    migration.includes(`v_to := j.started_at + interval '${DIET_STARTING_WEEK_DAYS.value} days';`),
    "private.diet_starting_weight's week",
  );
});

check("the eclectus alert's species match is the file's pattern", () => {
  const code = readFileSync("src/lib/journeys.ts", "utf8");
  assert.ok(
    code.includes(`/${ECLECTUS_PATTERN.value}/i.test(species ?? "")`),
    "isEclectus uses ECLECTUS_PATTERN",
  );
  assert.ok(isEclectus("Eclectus") && isEclectus("Vosmaeri eclectus"));
  assert.ok(!isEclectus(null) && !isEclectus("") && !isEclectus("Amazon"), "no species, no alert");
});

check("the switches: the database check, the migrations and healthFeatures.ts agree", () => {
  const file = Object.fromEntries(HEALTH_FEATURES.map((f) => [f.feature, f.startsAt]));
  assert.deepEqual(JSON.parse(sqlLiteral("expected_features")), file);
  const migration = [
    "supabase/migrations/20261122203000_health_features.sql",
    "supabase/migrations/20261125030000_diet_starting_weight.sql",
  ]
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
  const seeded = Object.fromEntries(
    [...migration.matchAll(/^\s*\('([a-z_]+)', '(off|admins|everyone)',/gm)].map((m) => [
      m[1],
      m[2],
    ]),
  );
  assert.deepEqual(seeded, file);
});

check("triage: red on one concerning answer exactly for the file's questions", () => {
  const normal = Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, "normal"])) as Record<
    ScanFieldKey,
    ScanAnswer
  >;
  assert.deepEqual(sorted(SCAN_FIELDS.map((f) => f.key)), sorted(TRIAGE_RULES.notSureYellow.value));
  for (const f of SCAN_FIELDS) {
    const r = computeTriage({ ...normal, [f.key]: "concerning" });
    assert.equal(
      r.status,
      TRIAGE_RULES.redOnConcerning.value.includes(f.key) ? "red" : "yellow",
      f.key,
    );
    assert.equal(
      computeTriage({ ...normal, [f.key]: "not_sure" }).status,
      "yellow",
      `${f.key} not sure`,
    );
  }
  assert.equal(computeTriage(normal).status, "green");
});

check("triage: the 'worth a call' message starts at the file's count", () => {
  const normal = Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, "normal"])) as Record<
    ScanFieldKey,
    ScanAnswer
  >;
  const keys = SCAN_FIELDS.map((f) => f.key);
  const n = TRIAGE_RULES.yellowCallAt.value;
  const withSigns = (count: number) =>
    computeTriage({
      ...normal,
      ...Object.fromEntries(keys.slice(0, count).map((k) => [k, "not_sure"])),
    });
  const one = withSigns(n - 1).message;
  const call = withSigns(n).message;
  assert.notEqual(one, call);
  assert.match(call, /worth a call/);
});

check("care weight: steady band and window match the file", () => {
  const day = 86_400_000;
  const at = (daysAgo: number) => new Date(Date.now() - daysAgo * day).toISOString();
  const pct = CARE_WEIGHT_RULES.steadyPct.value / 100;
  const base = 400;
  const edge = base * (1 - pct);
  assert.equal(
    computeWeightTrend([
      { grams: edge, measured_at: at(0) },
      { grams: base, measured_at: at(10) },
    ]).trend,
    "steady",
  );
  assert.equal(
    computeWeightTrend([
      { grams: edge - 1, measured_at: at(0) },
      { grams: base, measured_at: at(10) },
    ]).trend,
    "down",
  );
  const w = CARE_WEIGHT_RULES.trendWindowDays.value;
  assert.equal(
    computeWeightTrend([
      { grams: 300, measured_at: at(0) },
      { grams: base, measured_at: at(w + 1) },
    ]).trend,
    "steady",
  );
  assert.equal(
    computeWeightTrend([
      { grams: 300, measured_at: at(0) },
      { grams: base, measured_at: at(w - 1) },
    ]).trend,
    "down",
  );
});

check("care weight: the Home pill's steady grams match the file", () => {
  const g = CARE_WEIGHT_RULES.pillSteadyGrams.value;
  assert.equal(weightTrendPill([{ grams: 100 - g + 0.1 }, { grams: 100 }]).tone, "good");
  assert.equal(weightTrendPill([{ grams: 100 - g }, { grams: 100 }]).tone, "attention");
});

check("care weight: 'Save anyway?' starts above the file's percent", () => {
  const p = CARE_WEIGHT_RULES.bigChangePct.value;
  assert.equal(bigWeightChange(100, 100 + p), null);
  assert.equal(bigWeightChange(100, 100 + p + 1), p + 1);
});

check("the vet nudge's button goes to the file's link", () => {
  assert.equal(AAV_FIND_A_VET_URL, FIND_A_VET_URL.value);
});

check("emergency: keep-warm range and default poison lines match the file", () => {
  assert.equal(warmRange("America/New_York", "en"), EMERGENCY_RULES.keepWarmF.value);
  assert.equal(warmRange("Europe/London", "en"), EMERGENCY_RULES.keepWarmC.value);
  const lines = EMERGENCY_RULES.poisonLines.value;
  assert.deepEqual(
    defaultPoisonLines("America/Chicago").map((l) => l.dial),
    lines.us,
  );
  assert.deepEqual(
    defaultPoisonLines("Europe/London").map((l) => l.dial),
    lines.uk,
  );
  assert.deepEqual(
    defaultPoisonLines("Australia/Sydney").map((l) => l.dial),
    lines.au,
  );
});

check("every wording prefix names real keys in en.jsonc", () => {
  const en = readFileSync("src/locales/en.jsonc", "utf8");
  for (const [area, r] of Object.entries(HEALTH_WORDING)) {
    for (const prefix of r.value) assert.ok(en.includes(`\n  "${prefix}`), `${area}: ${prefix}`);
  }
});

if (failed) process.exit(1);
