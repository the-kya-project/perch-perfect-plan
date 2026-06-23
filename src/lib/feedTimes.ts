// Structured feed times for Food items.
//
// A food's feeding schedule is a set of day-part PERIODS (each optionally with a
// specific clock time for display) plus an "available all day / free-fed" flag.
// The period is a fixed enum, so placement into a routine section is a DIRECT
// map — no text parsing. The optional clock time is display detail only and does
// NOT drive placement.
//
// Stored on each DietItem as `times: FeedTime[]` (+ `freeFed: boolean`).
// Legacy data stored `times: string[]` of free text; normalizeFeedTimes() reads
// either shape so existing data keeps working and upgrades on next save.

import { feedTimeToDaypart, type Daypart } from "./routineTasks";

export type FeedPeriod = "morning" | "midday" | "evening";

export const FEED_PERIODS: { value: FeedPeriod; label: string; meal: string }[] = [
  { value: "morning", label: "Morning", meal: "Breakfast" },
  { value: "midday", label: "Midday", meal: "Lunch" },
  { value: "evening", label: "Evening", meal: "Dinner" },
];

/** A period the food is fed in, with an optional specific time ("HH:MM", 24h). */
export type FeedTime = { period: FeedPeriod; at?: string | null };

const PERIOD_SET = new Set<FeedPeriod>(["morning", "midday", "evening"]);

/** Period → routine section. Direct map (FeedPeriod is a subset of Daypart). */
export function periodToDaypart(p: FeedPeriod): Daypart {
  return p;
}

/** "HH:MM" (24h, from <input type="time">) → "7:00 AM" for display. null if blank. */
export function formatAt(at: string | null | undefined): string | null {
  if (!at) return null;
  const m = String(at).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return at; // already display-formatted or unknown — show as-is
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 23 || min > 59) return null;
  const ap = h < 12 ? "AM" : "PM";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  return `${hh}:${String(min).padStart(2, "0")} ${ap}`;
}

/** Best-effort extract of a 24h "HH:MM" from a legacy free-text value, else null. */
function extractClock24(s: string): string | null {
  const m = String(s).toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3] ? m[3].replace(/\./g, "") : "";
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Read a DietItem's times into structured FeedTime[], tolerant of legacy
 *  string[] free text. Unmappable named values default to Morning (and are
 *  logged by feedTimeToDaypart) so a feeding is never dropped. */
export function normalizeFeedTimes(raw: unknown): FeedTime[] {
  if (!Array.isArray(raw)) return [];
  const out: FeedTime[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === "object" && "period" in (entry as any)) {
      const p = (entry as any).period;
      if (PERIOD_SET.has(p)) out.push({ period: p, at: (entry as any).at ?? null });
      continue;
    }
    if (typeof entry === "string") {
      const s = entry.trim();
      if (!s) continue;
      const dp = feedTimeToDaypart(s);
      const period: FeedPeriod = dp === "anytime" || dp === "evening" || dp === "midday" || dp === "morning"
        ? (dp === "anytime" ? "morning" : dp)
        : "morning";
      out.push({ period, at: extractClock24(s) });
    }
  }
  return out;
}

/** Human label for a feed time, e.g. "Breakfast — around 7:00 AM" or "Dinner". */
export function feedTimeLabel(ft: FeedTime, style: "meal" | "period" = "meal"): string {
  const def = FEED_PERIODS.find((p) => p.value === ft.period);
  const base = style === "meal" ? (def?.meal ?? "Feeding") : (def?.label ?? "Feeding");
  const at = formatAt(ft.at);
  return at ? `${base} — around ${at}` : base;
}
