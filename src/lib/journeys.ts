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
