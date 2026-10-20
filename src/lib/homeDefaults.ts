// "Your home" reminders for sitters: hazards, off-limits areas, other pets and
// cleaning products. The owner enters them once (owner_home_defaults) and every
// bird uses them, unless a bird has its own answer in care_plans — the same
// "bird value wins when set" rule emergency contacts use (see emergency.ts).
//
// Each group is judged as a whole: a bird with any hazard of its own keeps its
// whole hazards list, rather than mixing its chips with the shared ones.

export type HomeDefaults = {
  hazards?: string[] | null;
  hazards_other?: string | null;
  off_limits?: string | null;
  other_pets?: string | null;
  cleaning_instructions?: string | null;
};

export const HOME_GROUPS = ["hazards", "off_limits", "other_pets", "cleaning"] as const;
export type HomeGroup = (typeof HOME_GROUPS)[number];

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown) => (Array.isArray(v) ? (v as string[]).filter((x) => text(x)) : []);

/** The care_plans columns each group owns, cleared together. */
export const HOME_GROUP_COLUMNS: Record<HomeGroup, string[]> = {
  hazards: ["hazards", "hazards_other"],
  // off_limits_rooms is the denormalized mirror the sitter view joins in.
  off_limits: ["off_limits", "off_limits_rooms"],
  other_pets: ["other_pets"],
  cleaning: ["cleaning_instructions"],
};

/** A comparable value for a group, or "" when empty. */
function groupValue(row: any, group: HomeGroup): string {
  if (!row) return "";
  switch (group) {
    case "hazards": {
      const chips = [...list(row.hazards)].sort();
      const other = text(row.hazards_other);
      return chips.length || other ? JSON.stringify([chips, other]) : "";
    }
    case "off_limits": return text(row.off_limits) || text(row.off_limits_rooms);
    case "other_pets": return text(row.other_pets);
    case "cleaning": return text(row.cleaning_instructions);
  }
}

/** True when the bird has its own answer for this group. */
export function birdHasOwn(plan: any, group: HomeGroup): boolean {
  return groupValue(plan, group) !== "";
}

/**
 * The plan as a reader should see it: the bird's own answers where it has
 * them, the owner's shared answers everywhere else. Returns a new object.
 */
export function mergeHome<T extends Record<string, any> | null | undefined>(plan: T, defaults: HomeDefaults | null | undefined): T {
  if (!plan || !defaults) return plan;
  const out: Record<string, any> = { ...plan };
  if (!birdHasOwn(plan, "hazards")) {
    out.hazards = list(defaults.hazards);
    out.hazards_other = defaults.hazards_other ?? null;
  }
  if (!birdHasOwn(plan, "off_limits")) {
    out.off_limits = defaults.off_limits ?? null;
    out.off_limits_rooms = null;
  }
  if (!birdHasOwn(plan, "other_pets")) out.other_pets = defaults.other_pets ?? null;
  if (!birdHasOwn(plan, "cleaning")) out.cleaning_instructions = defaults.cleaning_instructions ?? null;
  return out as T;
}

/** Groups where this bird's own answer differs from the shared one. */
export function homeDifferences(plan: any, defaults: HomeDefaults | null | undefined): HomeGroup[] {
  return HOME_GROUPS.filter((g) => birdHasOwn(plan, g) && groupValue(plan, g) !== groupValue(defaults, g));
}

/**
 * The care_plans patch that makes a bird follow the shared answers for every
 * group where its own answer matches them (or is empty). Used once, when the
 * owner first saves "Your home": matching birds follow it from then on, and
 * birds with different answers keep them. Null when there's nothing to clear.
 */
export function followSharedPatch(plan: any, defaults: HomeDefaults): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};
  for (const g of HOME_GROUPS) {
    if (!birdHasOwn(plan, g) || groupValue(plan, g) !== groupValue(defaults, g)) continue;
    for (const col of HOME_GROUP_COLUMNS[g]) patch[col] = col === "hazards" ? [] : null;
  }
  return Object.keys(patch).length ? patch : null;
}

/** The care_plans patch that drops all of a bird's own answers. */
export function clearOwnPatch(): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const g of HOME_GROUPS) for (const col of HOME_GROUP_COLUMNS[g]) patch[col] = col === "hazards" ? [] : null;
  return patch;
}

/** True when the shared reminders have anything in them. */
export function homeHasContent(row: HomeDefaults | null | undefined): boolean {
  return HOME_GROUPS.some((g) => groupValue(row, g) !== "");
}

/** The four groups as a care_plans-shaped row (what the form edits). */
export type HomeRow = {
  hazards: string[];
  hazards_other: string | null;
  off_limits: string | null;
  other_pets: string | null;
  cleaning_instructions: string | null;
};

/**
 * Starting answers for an owner's first "Your home" save: this bird's own
 * answer for each group, otherwise the answer most of their other birds share,
 * so the first save lines up with as many birds as possible.
 */
export function seedShared(current: any, others: any[]): HomeRow {
  const pick = (g: HomeGroup) => {
    if (birdHasOwn(current, g)) return current;
    const counts = new Map<string, { n: number; row: any }>();
    for (const p of others) {
      const v = groupValue(p, g);
      if (!v) continue;
      const c = counts.get(v);
      counts.set(v, { n: (c?.n ?? 0) + 1, row: p });
    }
    let best: { n: number; row: any } | null = null;
    for (const c of counts.values()) if (!best || c.n > best.n) best = c;
    return best?.row ?? null;
  };
  const hz = pick("hazards");
  const ol = pick("off_limits");
  return {
    hazards: list(hz?.hazards),
    hazards_other: hz?.hazards_other ?? null,
    off_limits: ol ? (text(ol.off_limits) || text(ol.off_limits_rooms) || null) : null,
    other_pets: pick("other_pets")?.other_pets ?? null,
    cleaning_instructions: pick("cleaning")?.cleaning_instructions ?? null,
  };
}

/** Same comparison the merge uses, for one group of two rows. */
export function sameGroup(a: any, b: any, group: HomeGroup): boolean {
  return groupValue(a, group) === groupValue(b, group);
}

// ---------- Cleaning products: two parts in one text field ----------
//
// cleaning_instructions stays one text column. The Reminders screen splits it
// into a "never use near the birds" list and "what to use instead", saved as
// two lines:
//   Never use near the birds: Bleach, Pine-Sol
//   Use instead: Vinegar spray, under the sink
// The line labels are written in the owner's language; both English and Dutch
// are read back. Text saved before this format (free text) reads as "use
// instead", so nothing is lost.

export const CLEANING_NEVER_DEFAULTS = ["Bleach", "Pine-Sol", "Aerosol sprays", "Plug-in air fresheners"];

const NEVER_LABELS = ["Never use near the birds:", "Nooit gebruiken bij de vogels:"];
const INSTEAD_LABELS = ["Use instead:", "Gebruik in plaats daarvan:"];

export type CleaningParts = { never: string[]; instead: string };

function stripLabel(line: string, labels: string[]): string | null {
  const l = labels.find((x) => line.toLowerCase().startsWith(x.toLowerCase()));
  return l ? line.slice(l.length).trim() : null;
}

export function parseCleaning(text: string | null | undefined): CleaningParts {
  const raw = (text ?? "").trim();
  if (!raw) return { never: [], instead: "" };
  const lines = raw.split(/\r?\n/);
  const neverLine = stripLabel(lines[0], NEVER_LABELS);
  if (neverLine == null) return { never: [], instead: raw };
  const never = neverLine.split(",").map((s) => s.trim()).filter(Boolean);
  const rest = lines.slice(1).join("\n").trim();
  const instead = stripLabel(rest, INSTEAD_LABELS) ?? rest;
  return { never, instead };
}

/** The two parts as saved text; labels come from the caller (translated). */
export function formatCleaning(parts: CleaningParts, labels: { never: string; instead: string } = { never: NEVER_LABELS[0], instead: INSTEAD_LABELS[0] }): string | null {
  const never = parts.never.map((s) => s.trim()).filter(Boolean);
  const instead = parts.instead.trim();
  const lines: string[] = [];
  if (never.length) lines.push(`${labels.never} ${never.join(", ")}`);
  if (instead) lines.push(never.length ? `${labels.instead} ${instead}` : instead);
  return lines.length ? lines.join("\n") : null;
}
