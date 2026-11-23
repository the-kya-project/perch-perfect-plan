// Health rules: every health threshold, phrase list and safety wording in one
// place, for the avian vet's review (docs/flock/opening-scope.md B7, backlog 1.2).
//
// Nothing here has been reviewed by an avian vet. Every value is marked
// "draft, pending vet review" with where it came from. When the vet approves,
// changes or rejects one, change it here first; `npm run test:health-rules`
// then shows every place that has to follow (the app's own code, and the
// database values pinned by supabase/checks/health_rules_checks.sql).
//
// Where a value is used:
//   - code constants: the module named in `where` must agree with this file
//     (checked by scripts/health-rules.test.ts);
//   - database settings (`journey_settings`, `flock_vet_signs`): the table
//     must agree with this file (supabase/checks/health_rules_checks.sql, and
//     the test checks that file against this one);
//   - wording: lives in the language files; `HEALTH_WORDING` lists the keys.
//
// Each health feature also has its own switch (off / admins / everyone) in
// `public.health_features`; the list is `HEALTH_FEATURES` in
// src/lib/healthFeatures.ts.

export const DRAFT = "draft, pending vet review" as const;
export type ReviewStatus = typeof DRAFT;

export type HealthRule<T> = {
  value: T;
  status: ReviewStatus;
  /** Where the value came from: research, a rule of thumb, or our own starting point. */
  source: string;
  /** Where the app uses it today. */
  where: string;
};

function draft<T>(value: T, source: string, where: string): HealthRule<T> {
  return { value, status: DRAFT, source, where };
}

const OUR_START = "Kya & Co. starting value; no published source";
const FIRST_AID = "https://parrots.org/wp-content/uploads/2024/02/AvianFirstAid.pdf";
const HARRISONS =
  "https://www.harrisonsbirdfoods.com/tracking-what-matters-body-condition-in-the-companion-parrot-2/";

// ---------------------------------------------------------------------------
// 1. Diet conversion's weight safeguard (Flock journeys).
// Database: one row in public.journey_settings; keys are its column names.
// ---------------------------------------------------------------------------
const JS = "public.journey_settings";
export const DIET_WEIGHT_RULES = {
  diet_pause_drop_pct: draft(5, OUR_START, `${JS} (20261107220000_journeys_updates.sql)`),
  diet_notice_drop_pct: draft(
    2.5,
    `${OUR_START}; matches the care app's steady band (CARE_WEIGHT_RULES.steadyPct)`,
    `${JS} (20261107220000_journeys_updates.sql)`,
  ),
  diet_notice_clear_pct: draft(1.5, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_avg_count: draft(3, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_avg_recent_days: draft(3, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_avg_min_recent: draft(2, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_slide_days: draft(7, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_slide_drop_pct: draft(3, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_slide_min_readings: draft(4, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_sudden_drop_pct: draft(8, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_min_drop_grams: draft(2, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
  diet_missed_days: draft(2, OUR_START, `${JS} (20261108160000_diet_weight_rules.sql)`),
} as const;
export type DietWeightRuleKey = keyof typeof DIET_WEIGHT_RULES;

/** Diet conversion can't be started for these birds (a species match, case-insensitive). */
export const NECTAR_EATER_PATTERN = draft(
  "(lory|lories|lorikeet)",
  `${OUR_START}. Open question for the vet: should other nectar or specialist feeders (hanging parrots, swift parrot, fig parrots) be blocked too?`,
  "private.is_nectar_eater (20261108150000_diet_conversion_vet_guidance.sql)",
);

// ---------------------------------------------------------------------------
// 2. The vet nudge on Flock posts (public.flock_vet_signs, review_status
// 'draft'). 'today' shows the "call your vet today" card; 'urgent' shows
// "This could be an emergency". Whole words or phrases, case-insensitive.
// ---------------------------------------------------------------------------
const VET_SIGNS =
  "public.flock_vet_signs (20261108100000_flock_posts.sql, 20261108170000_flock_vet_nudge_tiers.sql, 20261108180000_flock_vet_nudge_tighten.sql)";
const VET_SIGNS_SOURCE = OUR_START;

export const VET_SIGNS_TODAY = draft<readonly string[]>(
  [
    "black droppings",
    "bleeding",
    "blood",
    "blood in droppings",
    "bloody droppings",
    "breathing hard",
    "breathing heavily",
    "can't perch",
    "change in droppings",
    "clicking when breathing",
    "discharge from",
    "droppings changed",
    "eating less",
    "fluffed up all day",
    "fluffed up and sleeping",
    "fluffing up",
    "isn't eating",
    "lethargic",
    "losing weight",
    "lost weight",
    "no droppings",
    "not eating",
    "not eating much",
    "on the bottom of the cage",
    "on the cage floor",
    "open mouth breathing",
    "open-mouth breathing",
    "puffed up all day",
    "sitting on the cage floor",
    "sitting on the floor of the cage",
    "sleeping a lot",
    "sleeping more",
    "sleeping on the bottom",
    "sleepy all day",
    "stopped eating",
    "swollen",
    "tail bob",
    "tail bobbing",
    "tail is bobbing",
    "throwing up",
    "vomiting",
    "watery droppings",
    "wheezing",
    "won't eat",
  ],
  VET_SIGNS_SOURCE,
  `${VET_SIGNS}, tier 'today'`,
);

export const VET_SIGNS_URGENT = draft<readonly string[]>(
  [
    "ate avocado",
    "ate chocolate",
    "ate something toxic",
    "bad fall",
    "bitten by a cat",
    "bitten by a dog",
    "bleeding a lot",
    "bleeding won't stop",
    "blood feather broke",
    "breathed in fumes",
    "breathed smoke",
    "broke a blood feather",
    "broken a blood feather",
    "broken blood feather",
    "burned a pan",
    "can't get up",
    "can't pass an egg",
    "can't pass her egg",
    "can't stand",
    "can't stand up",
    "can't stop the bleeding",
    "cat bit",
    "cat bite",
    "chewed lead",
    "chewed zinc",
    "convulsing",
    "crashed into",
    "dog bit",
    "dog bite",
    "drank alcohol",
    "drank coffee",
    "egg binding",
    "egg bound",
    "egg is stuck",
    "egg-binding",
    "egg-bound",
    "falling off her perch",
    "falling off his perch",
    "falling off the perch",
    "fell off her perch",
    "fell off his perch",
    "fell off the perch",
    "fluffed on the cage floor",
    "fluffed on the floor",
    "fluffed up on the floor",
    "fumes",
    "got burned",
    "got into alcohol",
    "got into avocado",
    "had a seizure",
    "had caffeine",
    "hard fall",
    "has a burn",
    "having a seizure",
    "heavy metal poisoning",
    "house fire",
    "keeps regurgitating",
    "keeps throwing up",
    "keeps vomiting",
    "lead paint",
    "lead poisoning",
    "overheated a pan",
    "pan fumes",
    "poisoned",
    "poisoning",
    "ptfe fumes",
    "regurgitating repeatedly",
    "seizure",
    "seizures",
    "sitting fluffed on the floor",
    "smoke inhalation",
    "sprayed in the room",
    "sprayed near",
    "still bleeding",
    "straining",
    "stuck egg",
    "teflon fumes",
    "throwing up repeatedly",
    "unable to stand",
    "vomiting again and again",
    "vomiting repeatedly",
    "won't stop bleeding",
    "zinc poisoning",
  ],
  VET_SIGNS_SOURCE,
  `${VET_SIGNS}, tier 'urgent'`,
);

/** Where the vet nudge's button goes. */
export const FIND_A_VET_URL = draft(
  "https://www.aav.org/page/FindAVet2",
  "Association of Avian Veterinarians' own directory",
  "AAV_FIND_A_VET_URL in src/lib/flockPosts.ts",
);

// ---------------------------------------------------------------------------
// 3. The daily health check's triage (care app, live for everyone).
// ---------------------------------------------------------------------------
export const TRIAGE_RULES = {
  /** A single "concerning" answer to one of these means red. */
  redOnConcerning: draft<readonly string[]>(
    ["food", "droppings", "breathing", "posture", "vomiting", "injury", "exposure"],
    `${OUR_START} (placeholder from the PRD, Phase 1)`,
    "SCAN_FIELDS[].redOnConcerning in src/lib/triage.ts",
  ),
  /** Questions where "not sure" counts as a sign. Every "not sure" currently counts. */
  notSureYellow: draft<readonly string[]>(
    [
      "alertness",
      "food",
      "droppings",
      "breathing",
      "posture",
      "noise",
      "fluffed",
      "vomiting",
      "injury",
      "exposure",
    ],
    `${OUR_START}: a "not sure" is never logged as all-clear`,
    "computeTriage in src/lib/triage.ts",
  ),
  /** This many yellow signs together gets the "worth a call" message. */
  yellowCallAt: draft(2, OUR_START, "computeTriage in src/lib/triage.ts"),
} as const;

// ---------------------------------------------------------------------------
// 4. Weight in the care app (live for everyone).
// ---------------------------------------------------------------------------
export const CARE_WEIGHT_RULES = {
  /** Within this percent of the window's first weight reads "steady". */
  steadyPct: draft(2.5, OUR_START, "computeWeightTrend in src/lib/weightTrend.ts"),
  /** The trend window, in days. */
  trendWindowDays: draft(90, OUR_START, "computeWeightTrend in src/lib/weightTrend.ts"),
  /** The Home pill: less than this many grams from the last weight reads "Steady";
   *  any drop of this much or more is amber, and any gain shows as good (open question for the vet). */
  pillSteadyGrams: draft(1, OUR_START, "weightTrendPill in src/lib/weightTrend.ts"),
  /** "Save anyway?" when a new weight is more than this percent from the last one (a likely typo). */
  bigChangePct: draft(10, OUR_START, "bigWeightChange in src/lib/dailyLog.ts"),
} as const;

// ---------------------------------------------------------------------------
// 5. Weight baseline (backlog D1.1). The most conservative starting values
// from opening-scope B4. Behind the `weight_baseline` switch (off); nothing in
// the app reads these yet (the screens are D1.2).
// ---------------------------------------------------------------------------
const WB = "computeWeightBaseline in src/lib/weightBaseline.ts";
export const WEIGHT_BASELINE_RULES = {
  /** "Still learning" until at least this many weigh-ins… */
  minWeighIns: draft(7, OUR_START, WB),
  /** …spread over at least this many days. */
  minDays: draft(14, OUR_START, WB),
  /** The bird's normal is worked out from this many days of weigh-ins… */
  baselineWindowDays: draft(
    90,
    `${OUR_START}; matches the care app's trend window (CARE_WEIGHT_RULES.trendWindowDays)`,
    WB,
  ),
  /** …leaving out the most recent days, so a drop now doesn't pull the normal down with it. */
  baselineSkipDays: draft(7, `${OUR_START}; the same week as keepAnEyeDays`, WB),
  /** The normal range: these percentiles of those weigh-ins (the normal itself is the median). */
  rangeLowPercentile: draft(10, OUR_START, WB),
  rangeHighPercentile: draft(90, OUR_START, WB),
  /** "Worth watching": this percent below the bird's own normal. */
  worthWatchingPct: draft(2.5, `${OUR_START}; the care app's existing amber level`, WB),
  /** "Keep an eye on this": this percent below over a week. */
  keepAnEyePct: draft(5, `${OUR_START}; the Diet conversion's pause level`, WB),
  keepAnEyeDays: draft(7, OUR_START, WB),
  /** "Call your vet today": this percent below. Some guidance is stricter (about 2% in one weighing). */
  callVetTodayPct: draft(10, `Avian first-aid rule of thumb (${FIRST_AID}; ${HARRISONS})`, WB),
  /** No alert counts until a re-weigh agrees: this many weigh-ins in a row (of the same
   *  kind) must all be that far below. Until then the app asks for a re-weigh instead. */
  confirmMinReadings: draft(2, `${OUR_START}; the Diet conversion's diet_avg_min_recent`, WB),
  /** …all within this many days of the latest. */
  confirmDays: draft(3, `${OUR_START}; the Diet conversion's diet_avg_recent_days`, WB),
  /** A drop must also be at least this many grams (a small bird's scale noise). */
  minDropGrams: draft(2, `${OUR_START}; the Diet conversion's diet_min_drop_grams`, WB),
  /** The free hard weight-loss alert: this percent below, confirmed by a re-weigh. It works
   *  while the baseline is still learning, so "still learning" never reads as "all fine". */
  hardLossPct: draft(
    10,
    `Avian first-aid rule of thumb (${FIRST_AID}; ${HARRISONS}); the same as callVetTodayPct`,
    WB,
  ),
  /** While still learning, the hard alert compares with the median of this many days before
   *  the latest weigh-ins (the last confirmDays left out). Once learned it uses the normal. */
  hardLossReferenceDays: draft(30, OUR_START, WB),
} as const;

// ---------------------------------------------------------------------------
// 6. Emergency guidance numbers (the sitter page's emergency guides).
// ---------------------------------------------------------------------------
export const EMERGENCY_RULES = {
  keepWarmF: draft("85–90 °F", OUR_START, "warmRange in src/lib/poisonControl.ts"),
  keepWarmC: draft("29–32 °C", "85–90 °F converted", "warmRange in src/lib/poisonControl.ts"),
  /** Default poison lines by region, when the owner left theirs empty. Checked on each service's site, Oct 2026. */
  poisonLines: draft<Readonly<Record<"us" | "uk" | "au", readonly string[]>>>(
    { us: ["8884264435", "8557647661"], uk: ["01202509000"], au: ["1300869738"] },
    "Each service's own website (ASPCA, Pet Poison Helpline, Animal PoisonLine, Animal Poisons Helpline), Oct 2026",
    "defaultPoisonLines in src/lib/poisonControl.ts",
  ),
} as const;

// ---------------------------------------------------------------------------
// 7. Safety wording, by area. Each entry is a key prefix in
// src/locales/en.jsonc (Dutch follows the same keys) or a file.
// ---------------------------------------------------------------------------
export const HEALTH_WORDING: Readonly<Record<string, HealthRule<readonly string[]>>> = {
  dailyHealthCheck: draft(
    [
      "ownerScan.msg",
      "ownerScan.title",
      "sitter.scan.",
      "planEditor.triage",
      "planEditor.scan",
      "scanForm.",
      "vetSummary.triage",
    ],
    OUR_START,
    "the daily and full health check; TRIAGE_DISCLAIMER and SCAN_FIELDS help text in src/lib/triage.ts",
  ),
  weight: draft(
    ["weightPill.", "weightTrend.", "vetSummary.trend"],
    OUR_START,
    "src/lib/weightTrend.ts",
  ),
  emergencyGuides: draft(
    ["sitter.emergency."],
    OUR_START,
    "src/routes/sitter/$token/emergency.tsx",
  ),
  passingGuidance: draft(["passingGuidance."], OUR_START, "src/components/PassingGuidance.tsx"),
  dietConversion: draft(
    ["flock.journeys.diet."],
    OUR_START,
    "src/components/flock/JourneyDiet.tsx",
  ),
  vetNudge: draft(["flock.posts.vet"], OUR_START, "the Flock post composer"),
};
