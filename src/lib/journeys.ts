// Journeys (Community): the rules the screens show. Pure, so
// scripts/flock-shell.test.ts pins them. The database enforces every one of
// these again (20261107200000_journeys_core.sql); these only decide what to
// show, never what's allowed.

import type { TFunction } from "i18next";

/** Two levels: free (every skill, private journeys, one custom journey at a
 *  time) and Flock (the community features too; Kya's Crew is a Flock plan).
 *  Since the redesign (1.20) the level gates the community, not the skills. */
export type JourneyTier = "free" | "flock";

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
  /** Unused since the redesign: every skill can be started by everyone. */
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
  /** The stored tier; it no longer locks anything (1.20a). */
  tier: "free" | "premium";
  /** The skill's short description. */
  purpose: string;
  safety_notes: string[];
  safeguards: string[];
  tips: string[];
  sort_order: number;
  /** A short skill video, "cfstream:<uid>", or null (none at opening). */
  video_ref: string | null;
};

export const RHYTHMS: JourneyRhythm[] = ["most_days", "few_times_week", "weekends"];
export const CUSTOM_NAME_MAX = 60;
/** Your own skill's description, in the owner's words (the database allows 500). */
export const CUSTOM_DESCRIPTION_MAX = 500;

/** Pick a skill's groups, in this order. */
export type SkillGroup = JourneyTemplate["category"];
export const SKILL_GROUPS: SkillGroup[] = ["husbandry", "foundations", "food", "tricks"];

/** One list of all the skills, no free/Flock split: Handling and health,
 *  Foundations, Food, Tricks, each in catalog order. Empty groups are left out. */
export function groupSkills(templates: JourneyTemplate[]): { group: SkillGroup; skills: JourneyTemplate[] }[] {
  const sorted = [...templates].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return SKILL_GROUPS
    .map((group) => ({ group, skills: sorted.filter((t) => t.category === group) }))
    .filter((g) => g.skills.length > 0);
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

/** A journey's status as the screens group it: "Your journeys" shows active
 *  and paused ones first, then finished (learned it or happy where we are). */
export function isOpenJourney(status: JourneyStatus): boolean {
  return status === "active" || status === "paused";
}
export function sortYourJourneys<T extends { status: JourneyStatus; started_at: string; finished_at?: string | null }>(rows: readonly T[]): T[] {
  const open = rows.filter((r) => isOpenJourney(r.status)).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const done = rows.filter((r) => !isOpenJourney(r.status))
    .sort((a, b) => (b.finished_at ?? b.started_at).localeCompare(a.finished_at ?? a.started_at));
  return [...open, ...done];
}

/** May "[Bird] learned it!" be tapped? Active, or paused by the member; a
 *  weight pause lifts only through the vet confirmation (the database agrees). */
export function canFinishLearned(j: { status: JourneyStatus; paused_reason: string | null }): boolean {
  return j.status === "active" || (j.status === "paused" && j.paused_reason !== "weight_drop");
}

export type CustomProblem = "name" | "long";
/** What's wrong with your own skill, or null when it can start: a name of
 *  1 to 60 characters, and a description (optional) of up to 500. No steps. */
export function customProblem(name: string, description: string): CustomProblem | null {
  const n = name.trim();
  if (n.length < 1 || n.length > CUSTOM_NAME_MAX) return "name";
  if (description.trim().length > CUSTOM_DESCRIPTION_MAX) return "long";
  return null;
}

/** "Step-up!" → "step up": for comparing a typed name with the skills. */
function skillKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}
/** Your own skill's name matches one of the 14 (by name or slug, ignoring
 *  case, spacing and punctuation): the skill to suggest instead, or null. */
export function matchingSkill<T extends Pick<JourneyTemplate, "name" | "slug">>(name: string, templates: readonly T[]): T | null {
  const k = skillKey(name);
  if (!k) return null;
  return templates.find((tp) => skillKey(tp.name) === k || skillKey(tp.slug) === k) ?? null;
}

/** A member's own skill seen by someone outside its bird's household: labeled
 *  "Member-supplied journey" wherever it appears. */
export function isMemberSupplied(c: { template_slug: string | null; is_mine?: boolean }): boolean {
  return c.template_slug == null && !c.is_mine;
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

// ---- Posting and finishing ----------------------------------------------------

export type Engagement = "all_in" | "distracted" | "not_today";
export const ENGAGEMENTS: Engagement[] = ["all_in", "distracted", "not_today"];

/** A tip for next time after a hard day. */
export function wantsTip(e: Engagement): boolean {
  return e !== "all_in";
}

/** Where a new update goes, and what Post an update offers about the Flock:
 *  a community journey's question also shows to the Flock; a private one
 *  offers "Ask the Flock" (free accounts: the Flock sheet; members: share
 *  the journey). Nothing extra without a question. */
export type AskFlock = "none" | "community" | "offer_share" | "flock_sheet";
export function askFlock(caption: string, visibility: JourneyVisibility, canShare: boolean): AskFlock {
  if (!caption.includes("?")) return "none";
  if (visibility === "community") return "community";
  return canShare ? "offer_share" : "flock_sheet";
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

/** The first milestone not yet done (milestones are history now; Diet
 *  conversion's vet reminder still reads them until 1.20d). */
export function nextMilestone<T extends { position: number; state: string }>(ms: T[]): T | null {
  return [...ms].sort((a, b) => a.position - b.position).find((m) => m.state === "todo") ?? null;
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

/** "I'll call" journeys get the reminder card once the starting weight is set
 *  (the first week's weigh-ins, journey_weight_check's start_set), until they
 *  say they've talked; "Remind me later" hides it until vet_remind_after. */
export function showVetReminder(
  j: { vet_check: VetCheck | null; vet_remind_after: string | null; status: string },
  startSet: boolean,
  now: Date = new Date(),
): boolean {
  if (j.vet_check !== "will_call" || j.status !== "active") return false;
  if (j.vet_remind_after && new Date(j.vet_remind_after) > now) return false;
  return startSet;
}

/** Eclectus have their own food needs: the alert before the vet card, behind
 *  the diet_eclectus_alert switch (ECLECTUS_PATTERN in healthRules.ts). No
 *  species, no alert. */
export function isEclectus(species: string | null | undefined): boolean {
  return /eclectus/i.test(species ?? "");
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

/** Why a free account sees the "Part of the Flock" sheet: "How others did
 *  it" on a skill page, or "Ask the Flock" on a private journey. */
export type FlockSheetReason = "how_others" | "ask";
export function flockSheetTitle(t: TFunction, reason: FlockSheetReason): string {
  return reason === "ask"
    ? t("flock.journeys.flockOnly.title.ask", "Ask the Flock")
    : t("flock.journeys.flockOnly.title.howOthers", "See how others did it");
}
