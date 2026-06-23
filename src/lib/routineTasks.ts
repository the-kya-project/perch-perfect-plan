// One source of truth for routine items.
//
// Routine tasks that have a structured source elsewhere are auto-derived into
// `routine_tasks` by the setup wizard's sync functions (feeding/hygiene/water
// from the Food tab; medication from the Health tab). The guided Routine builder
// owns only pure-rhythm items that have no other source.
//
// There is no `is_auto_derived` column, so derived tasks are identified by their
// title prefix — the same convention the sync functions use to find and replace
// their own rows. Keep these prefixes in sync with the sync functions.

export const FEED_PREFIX = "Feed:";
export const HYG_REMOVE_PREFIX = "Remove fresh food";
export const HYG_WASH_FOOD_PREFIX = "Wash food bowls";
export const HYG_WASH_WATER_PREFIX = "Wash water bowl";
export const WATER_CHANGE_PREFIX = "Change water";
export const MED_TASK_PREFIX = "Medication";

const FOOD_PREFIXES = [
  FEED_PREFIX,
  HYG_REMOVE_PREFIX,
  HYG_WASH_FOOD_PREFIX,
  HYG_WASH_WATER_PREFIX,
  WATER_CHANGE_PREFIX,
];

/** The source section a derived task comes from, or null if it's a manual item. */
export function derivedSource(title: string | null | undefined): "Food" | "Health" | null {
  const t = (title ?? "").trim().toLowerCase();
  if (!t) return null;
  if (FOOD_PREFIXES.some((p) => t.startsWith(p.toLowerCase()))) return "Food";
  if (t.startsWith(MED_TASK_PREFIX.toLowerCase())) return "Health";
  return null;
}

/** True when a routine task is auto-derived from a structured source (read-only in builders). */
export function isDerivedTask(title: string | null | undefined): boolean {
  return derivedSource(title) !== null;
}

// ---------------------------------------------------------------------------
// Day-part placement
//
// A single normalization that maps ANY feed-time value (named meals, named
// periods, or clock times) to a day-part section. Used at RENDER time by BOTH
// the owner Routine tab and the sitter Today checklist so they always agree —
// and it works on existing data without re-syncing, since it reads the stored
// feed-time string rather than a precomputed category.
// ---------------------------------------------------------------------------

export type Daypart = "morning" | "midday" | "evening" | "anytime";
export const DAYPARTS: Daypart[] = ["morning", "midday", "evening", "anytime"];
export const DAYPART_LABEL: Record<Daypart, string> = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  anytime: "Anytime",
};

/** Clock hour (0–23) → day-part. Boundaries: 5–10:59 morning, 11–16:59 midday,
 *  17:00–4:59 evening. Keep these in sync with the section headers. */
export function hourToDaypart(h: number): Daypart {
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "midday";
  return "evening"; // 17–23 and 0–4
}

/** Map a free-text feed time to a day-part. Never throws; unrecognized values
 *  fall back to "anytime" (and are logged) so a feeding is never dropped. */
export function feedTimeToDaypart(raw: string | null | undefined): Daypart {
  const s = (raw ?? "").trim().toLowerCase();
  if (!s) return "anytime";

  // Free-fed / available all day → a single "anytime" entry, never repeated.
  if (/\b(all[\s-]?day|available all day|free[\s-]?fed|free[\s-]?feed|on demand|any[\s-]?time)\b/.test(s)) {
    return "anytime";
  }

  // Clock time, e.g. "8 AM", "8am", "8 a.m.", "08:00", "8:00 AM", "20:00", "8 PM".
  if (/\d/.test(s)) {
    const m = s.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
    if (m) {
      let h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      const ap = m[3] ? m[3].replace(/\./g, "") : ""; // "a.m." -> "am"
      if (ap === "pm" && h < 12) h += 12;
      if (ap === "am" && h === 12) h = 0;
      if (h <= 23 && min <= 59) return hourToDaypart(h);
    }
    // Has digits but unparseable — fall through to named matching / fallback.
  }

  // Named meals / periods (case-insensitive). Word boundaries keep "uncover"
  // (morning) from matching the "cover" (evening) rule.
  if (/\b(breakfast|morning|sunrise|dawn|wake|uncover|early|first thing)\b/.test(s)) return "morning";
  if (/\b(lunch|midday|mid-day|noon|afternoon|nap)\b/.test(s)) return "midday";
  if (/\b(dinner|supper|evening|night|nighttime|bedtime|bed time|cover|sunset|dusk|midnight|late|tonight)\b/.test(s)) return "evening";
  if (/\bam\b/.test(s)) return "morning";
  if (/\bpm\b/.test(s)) return "evening";

  // Unrecognized: don't drop it — bucket as "anytime" and log so the value can
  // be added to the mapping later.
   
  console.warn(`[routine] unrecognized feed time, placing in Anytime: ${JSON.stringify(raw)}`);
  return "anytime";
}

/** Map a stored routine_tasks.category to a day-part (for tasks with no time). */
export function categoryToDaypart(category: string | null | undefined): Daypart {
  switch ((category ?? "").trim().toLowerCase()) {
    case "morning": return "morning";
    case "midday": return "midday";
    case "evening": return "evening";
    case "bedtime": return "evening";
    default: return "anytime"; // "custom", unknown, empty
  }
}

/** The day-part a routine task belongs in. The stored category is authoritative
 *  (feeding tasks store their fixed period directly), so it wins. Only fall back
 *  to parsing the feed-time string for legacy rows whose category isn't a clean
 *  day-part. */
export function taskDaypart(task: { time_of_day?: string | null; category?: string | null }): Daypart {
  const cat = (task?.category ?? "").trim().toLowerCase();
  if (cat === "morning" || cat === "midday" || cat === "evening") return cat;
  if (cat === "bedtime") return "evening";
  const t = (task?.time_of_day ?? "").trim();
  if (t) return feedTimeToDaypart(t); // legacy free-text feed times
  return "anytime"; // "custom", unknown, empty
}
