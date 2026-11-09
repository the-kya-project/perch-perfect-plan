// Journeys (Community): the rules the screens show. Pure, so
// scripts/flock-shell.test.ts pins them. The database enforces every one of
// these again (20261107200000_journeys_core.sql); these only decide what to
// show, never what's allowed.

export type JourneyTier = "free" | "premium" | "flock";
export type JourneyRhythm = "most_days" | "few_times_week" | "weekends";
export type JourneyVisibility = "community" | "private";
export type JourneyStatus = "active" | "paused" | "finished" | "happy_where_we_are";

export type JourneyAccess = {
  tier: JourneyTier;
  max_clip_seconds: number;
  max_clips_per_journey: number | null;
  max_open_custom: number | null;
  open_custom: number;
  max_upload_bytes: number;
  can_use_premium: boolean;
  can_share: boolean;
  can_view_community: boolean;
};

export type TemplateMilestone = { position: number; title: string };
export type JourneyTemplate = {
  id: string;
  slug: string;
  name: string;
  category: "husbandry" | "foundations" | "food" | "tricks";
  tier: "free" | "premium";
  purpose: string;
  done_when: string;
  suggested_first: string | null;
  typical_length: string;
  safety_notes: string[];
  safeguards: string[];
  tips: string[];
  sort_order: number;
  milestones: TemplateMilestone[];
};

export const RHYTHMS: JourneyRhythm[] = ["most_days", "few_times_week", "weekends"];
export const CUSTOM_MIN = 3;
export const CUSTOM_MAX = 8;
export const CUSTOM_NAME_MAX = 60;
export const MILESTONE_MAX = 300;

/** "The basics · free", then "Tricks and more · premium", each in catalog order. */
export function groupTemplates(templates: JourneyTemplate[]): { basics: JourneyTemplate[]; more: JourneyTemplate[] } {
  const sorted = [...templates].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return { basics: sorted.filter((t) => t.tier === "free"), more: sorted.filter((t) => t.tier === "premium") };
}

/** A premium template for someone without app premium (or the Flock). */
export function isLocked(t: Pick<JourneyTemplate, "tier">, access: Pick<JourneyAccess, "can_use_premium"> | undefined): boolean {
  return t.tier === "premium" && !access?.can_use_premium;
}

/** May they write another custom journey now? Free: one open at a time. */
export function canStartCustom(access: Pick<JourneyAccess, "max_open_custom" | "open_custom"> | undefined): boolean {
  if (!access) return false;
  return access.max_open_custom == null || access.open_custom < access.max_open_custom;
}

/** Who-sees-it choices: the community only for Flock members (and admins). */
export function visibilityChoices(access: Pick<JourneyAccess, "can_share"> | undefined): JourneyVisibility[] {
  return access?.can_share ? ["community", "private"] : ["private"];
}
export function defaultVisibility(access: Pick<JourneyAccess, "can_share"> | undefined): JourneyVisibility {
  return access?.can_share ? "community" : "private";
}

/** The first milestone the bird doesn't already do: where the journey starts. */
export function startHere(count: number, already: ReadonlySet<number>): number | null {
  for (let p = 1; p <= count; p++) if (!already.has(p)) return p;
  return null;
}

export type CustomProblem = "name" | "tooFew" | "tooMany" | "blank" | "long";
/** What's wrong with a custom journey, or null when it can start. Blank rows
 *  at the end are ignored (the editor keeps one empty row to type into). */
export function customProblem(name: string, milestones: string[]): CustomProblem | null {
  const n = name.trim();
  if (n.length < 1 || n.length > CUSTOM_NAME_MAX) return "name";
  const rows = trimTrailingBlanks(milestones);
  if (rows.some((m) => m.trim().length === 0)) return "blank";
  if (rows.some((m) => m.trim().length > MILESTONE_MAX)) return "long";
  if (rows.length < CUSTOM_MIN) return "tooFew";
  if (rows.length > CUSTOM_MAX) return "tooMany";
  return null;
}
export function trimTrailingBlanks(rows: string[]): string[] {
  const out = [...rows];
  while (out.length && out[out.length - 1].trim() === "") out.pop();
  return out;
}

/** Which pronoun to use for a bird, from the care app's sex field. */
export type BirdPronoun = "she" | "he" | "they";
export function birdPronoun(sex: string | null | undefined): BirdPronoun {
  const s = (sex ?? "").trim().toLowerCase();
  if (s === "female" || s === "f" || s === "hen") return "she";
  if (s === "male" || s === "m" || s === "cock") return "he";
  return "they";
}

/** "Juno's", "Iris'": the possessive for an English name. */
export function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

/** Diet conversion's "suggests a vet check" line, if the template has one. */
export function vetCheckLine(t: Pick<JourneyTemplate, "safeguards">): string | null {
  return t.safeguards.find((s) => /vet check/i.test(s)) ?? null;
}

/** Clip limit in words for the screens: "60 seconds", "5 minutes", "20 minutes". */
export function clipLimitParts(seconds: number): { count: number; unit: "seconds" | "minutes" } {
  return seconds % 60 === 0 && seconds >= 120 ? { count: seconds / 60, unit: "minutes" } : { count: seconds, unit: "seconds" };
}

// ---- Step 3B: posting, milestones, finishing ----------------------------------

export type Engagement = "all_in" | "distracted" | "not_today";
export const ENGAGEMENTS: Engagement[] = ["all_in", "distracted", "not_today"];

/** A tip instead of the milestone question after a hard day. */
export function wantsTip(e: Engagement): boolean {
  return e !== "all_in";
}

/** Days since the journey started, counting the first day as day 1. */
export function journeyDay(startedAt: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(startedAt).getTime();
  return Math.max(1, Math.floor(ms / 86_400_000) + 1);
}

/** Days from start to finish (at least 1). */
export function journeyDays(startedAt: string, endedAt: string | null | undefined, now: Date = new Date()): number {
  const end = endedAt ? new Date(endedAt) : now;
  return Math.max(1, Math.round((end.getTime() - new Date(startedAt).getTime()) / 86_400_000));
}

/** "Step up" → "step up", for "Echo learned step up". */
export function skillInSentence(skill: string): string {
  const s = skill.trim();
  return s ? s[0].toLowerCase() + s.slice(1) : s;
}

/** The milestone a post is about: the first not yet done. */
export function nextMilestone<T extends { position: number; state: string }>(ms: T[]): T | null {
  return [...ms].sort((a, b) => a.position - b.position).find((m) => m.state === "todo") ?? null;
}

/** Done (reached or already) out of all. */
export function progressOf(ms: { state: string }[]): { done: number; total: number } {
  return { done: ms.filter((m) => m.state !== "todo").length, total: ms.length };
}

/** "Last posted 2 days ago" pieces: days since, or null when never posted. */
export function daysSince(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** The weight safeguard's level, as the screens use it. */
export type WeightLevel = "none" | "notice" | "pause";

// ---- Diet conversion: the vet card and guidance --------------------------------

export const DIET_SLUG = "diet-conversion";
export type VetCheck = "talked" | "will_call";

/** Lories and lorikeets eat a nectar-based diet; Diet conversion isn't for them.
 *  The database refuses it too (journeys_block_nectar_diet). */
export function isNectarEater(species: string | null | undefined): boolean {
  return /(lory|lories|lorikeet)/i.test(species ?? "");
}

/** Under a year old, or no hatch date: the vet card adds the young-bird line. */
export function youngOrUnknownAge(birthDate: string | null | undefined, now: Date = new Date()): boolean {
  if (!birthDate) return true;
  const d = new Date(`${birthDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return true;
  const yearOn = new Date(d);
  yearOn.setFullYear(d.getFullYear() + 1);
  return now < yearOn;
}

/** "I'll call" journeys get the reminder card from milestone 2 on (milestone 1,
 *  the starting weight, is done), until they say they've talked; "Remind me
 *  later" hides it until vet_remind_after. */
export function showVetReminder(
  j: { vet_check: VetCheck | null; vet_remind_after: string | null; status: string; milestones: { position: number; state: string }[] },
  now: Date = new Date(),
): boolean {
  if (j.vet_check !== "will_call" || j.status !== "active") return false;
  if (j.vet_remind_after && new Date(j.vet_remind_after) > now) return false;
  const next = nextMilestone(j.milestones);
  return !!next && next.position >= 2;
}

// ---- Diet conversion: smoothed weight rules (the database decides; this draws) ----

/** For the weight card's line: at each counted weigh-in, the average of it and
 *  the counted ones before it, up to n. Readings left out get null and don't
 *  count toward later averages. */
export function rollingAverage(points: { grams: number; counted: boolean }[], n = 3): (number | null)[] {
  const kept: number[] = [];
  return points.map((p) => {
    if (!p.counted) return null;
    kept.push(p.grams);
    const last = kept.slice(-n);
    return Math.round((last.reduce((a, b) => a + b, 0) / last.length) * 10) / 10;
  });
}

// ---- Journey clip states (JourneyClipView draws them) ----------------------------

export type ClipPhase = "loading" | "processing" | "stalled" | "failed" | "ready";

/** Where a clip stands: still loading the links, being prepared (for up to
 *  `budgetMs` since first seen processing), still processing past that
 *  ("stalled": Try again), failed (the server said so, or the player did), or
 *  ready to play. A clip the server didn't return at all can't be played. */
export function clipPhase(o: {
  status: "ready" | "processing" | "failed" | undefined; loading: boolean; playerFailed: boolean;
  processingSince: number | undefined; now: number; budgetMs: number;
}): ClipPhase {
  if (!o.status) return o.loading ? "loading" : "failed";
  if (o.status === "failed" || o.playerFailed) return "failed";
  if (o.status === "processing") {
    return o.processingSince !== undefined && o.now - o.processingSince >= o.budgetMs ? "stalled" : "processing";
  }
  return "ready";
}
