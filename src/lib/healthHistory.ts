// Health history: every daily check (daily_logs) and weight (weight_entries)
// for the owner's birds, merged into one newest-first list. Feeds the Health
// tab summary and the full Health history page.
//
// Who did it:
//   - daily_logs: source 'owner' | 'household' | 'sitter'; run_by = the user
//     (null for a token sitter); sit_id is set for sitter and caregiver checks.
//   - weight_entries: source likewise; logged_by = the user (null for a token
//     sitter). Sitter weights before this change carry no sit_id, so they are
//     tied to a sit by bird + date (see sitForEntry).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SCAN_FIELDS, type ScanFieldKey } from "@/lib/triage";
import { localDateISO } from "@/lib/localDay";

// Status column per question (noise → behavior, fluffed → energy).
export const STATUS_COL: Record<ScanFieldKey, string> = {
  alertness: "alertness_status",
  food: "food_status",
  droppings: "droppings_status",
  breathing: "breathing_status",
  posture: "posture_status",
  noise: "behavior_status",
  fluffed: "energy_status",
  vomiting: "vomiting_status",
  injury: "injury_status",
  exposure: "exposure_status",
};

export type HistorySit = {
  id: string;
  title: string | null;
  sitter_name: string | null;
  sitter_email: string | null;
  caregiver_user_id: string | null;
  start_date: string;
  end_date: string;
  birdIds: string[];
};

type Base = {
  id: string;
  birdId: string;
  at: string; // ISO
  /** Logged through a sitter link. */
  bySitter: boolean;
  /** The user who logged it (null for a token sitter). */
  userId: string | null;
  /** The sit it belongs to: stored sit_id, else matched by bird + date for sitter weights. */
  sitId: string | null;
};
export type CheckEntry = Base & {
  kind: "check";
  triage: string;
  resolvedAt: string | null;
  answers: Partial<Record<ScanFieldKey, string | null>>;
  itemNotes: Record<string, string> | null;
  reasonCodes: unknown;
};
export type WeightEntry = Base & { kind: "weight"; grams: number; meal: string | null };
export type HistoryEntry = CheckEntry | WeightEntry;

/** Not-normal answers on a check ("things to watch"). Falls back to the
 *  triage reason codes when the per-question columns are empty. */
export function thingsToWatch(e: CheckEntry): number {
  const n = SCAN_FIELDS.filter((f) => {
    const a = e.answers[f.key];
    return a === "not_sure" || a === "concerning";
  }).length;
  if (n > 0) return n;
  if (e.triage !== "green" && Array.isArray(e.reasonCodes)) return (e.reasonCodes as unknown[]).length || 1;
  return e.triage !== "green" ? 1 : 0;
}

/** Answer counts across every question in the check. */
export function answerCounts(e: CheckEntry): { normal: number; notSure: number; concerning: number; total: number } {
  let normal = 0, notSure = 0, concerning = 0;
  for (const f of SCAN_FIELDS) {
    const a = e.answers[f.key];
    if (a === "normal") normal++;
    else if (a === "not_sure") notSure++;
    else if (a === "concerning") concerning++;
  }
  return { normal, notSure, concerning, total: SCAN_FIELDS.length };
}

/** The sit an entry belongs to. A stored sit_id wins; a sitter weight without
 *  one is matched to a sitter-link sit covering that bird on that day. */
export function sitForEntry(
  e: { birdId: string; at: string; bySitter: boolean; sitId: string | null },
  sits: HistorySit[],
  dayOf: (iso: string) => string,
): string | null {
  if (e.sitId) return e.sitId;
  if (!e.bySitter) return null;
  const day = dayOf(e.at);
  const hit = sits.find((s) => !s.caregiver_user_id && s.birdIds.includes(e.birdId) && s.start_date <= day && day <= s.end_date);
  return hit?.id ?? null;
}

export type Who = "everyone" | "you" | "sitters";
export type EntryType = "all" | "checks" | "weights";
export type HistoryFilter = { who: Who; birdId?: string | null; type: EntryType; sitId?: string | null };

export function filterEntries(entries: HistoryEntry[], f: HistoryFilter, myId: string | null | undefined): HistoryEntry[] {
  return entries.filter((e) => {
    if (f.who === "you" && (!myId || e.userId !== myId)) return false;
    if (f.who === "sitters" && !e.bySitter) return false;
    if (f.birdId && e.birdId !== f.birdId) return false;
    if (f.type === "checks" && e.kind !== "check") return false;
    if (f.type === "weights" && e.kind !== "weight") return false;
    if (f.sitId && e.sitId !== f.sitId) return false;
    return true;
  });
}

/** Group newest-first entries under their local day (YYYY-MM-DD), in order. */
export function groupByDay<T extends { at: string }>(entries: T[], dayOf: (iso: string) => string): { day: string; entries: T[] }[] {
  const out: { day: string; entries: T[] }[] = [];
  for (const e of entries) {
    const d = dayOf(e.at);
    const last = out[out.length - 1];
    if (last && last.day === d) last.entries.push(e);
    else out.push({ day: d, entries: [e] });
  }
  return out;
}

/** Local calendar day of an ISO timestamp. */
export function localDay(iso: string): string {
  return localDateISO(new Date(iso));
}

const LOG_SELECT =
  "id, bird_id, sit_id, source, run_by, created_at, triage_status, triage_reason_codes, resolved_at, item_notes, " +
  Object.values(STATUS_COL).join(", ");

export type HealthHistory = {
  entries: HistoryEntry[];
  sits: HistorySit[];
  /** Display names for user ids (loggers and household caregivers). */
  names: Record<string, string>;
  /** True when either table hit the fetch limit (older entries may exist). */
  more: boolean;
};

export async function fetchHealthHistory(birdIds: string[], ownerId: string | null, limit: number): Promise<HealthHistory> {
  if (!birdIds.length) return { entries: [], sits: [], names: {}, more: false };
  const [logs, weights, sits] = await Promise.all([
    (supabase as any).from("daily_logs").select(LOG_SELECT).in("bird_id", birdIds).order("created_at", { ascending: false }).limit(limit),
    supabase.from("weight_entries").select("id, bird_id, grams, measured_at, meal_relation, source, logged_by, sit_id")
      .in("bird_id", birdIds).order("measured_at", { ascending: false }).limit(limit),
    ownerId
      ? supabase.from("sits").select("id, title, sitter_name, sitter_email, caregiver_user_id, start_date, end_date, sit_birds(bird_id)")
          .eq("owner_id", ownerId).order("start_date", { ascending: false })
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  if (logs.error) throw logs.error;
  if (weights.error) throw weights.error;
  const sitList: HistorySit[] = ((sits.data ?? []) as any[]).map((s) => ({
    id: s.id, title: s.title ?? null, sitter_name: s.sitter_name, sitter_email: s.sitter_email,
    caregiver_user_id: s.caregiver_user_id, start_date: s.start_date, end_date: s.end_date,
    birdIds: ((s.sit_birds ?? []) as any[]).map((b) => b.bird_id),
  }));

  const checks: CheckEntry[] = ((logs.data ?? []) as any[]).map((r) => ({
    kind: "check",
    id: r.id,
    birdId: r.bird_id,
    at: r.created_at,
    bySitter: r.source === "sitter",
    userId: r.run_by ?? null,
    sitId: r.sit_id ?? null,
    triage: r.triage_status ?? "green",
    resolvedAt: r.resolved_at ?? null,
    answers: Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, r[STATUS_COL[f.key]] ?? null])),
    itemNotes: (r.item_notes ?? null) as Record<string, string> | null,
    reasonCodes: r.triage_reason_codes,
  }));
  const ws: WeightEntry[] = ((weights.data ?? []) as any[]).map((w) => {
    const base = { birdId: w.bird_id, at: w.measured_at, bySitter: w.source === "sitter", sitId: w.sit_id ?? null };
    return {
      kind: "weight",
      id: w.id,
      ...base,
      sitId: sitForEntry(base, sitList, localDay),
      userId: w.logged_by ?? null,
      grams: Number(w.grams),
      meal: w.meal_relation ?? null,
    };
  });
  const entries = [...checks, ...ws].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const ids = new Set<string>();
  for (const e of entries) if (e.userId) ids.add(e.userId);
  for (const s of sitList) if (s.caregiver_user_id) ids.add(s.caregiver_user_id);
  const names: Record<string, string> = {};
  if (ids.size) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", [...ids]);
    for (const p of (profs ?? []) as any[]) {
      const n = (p.display_name ?? "").toString().trim();
      if (n) names[p.id] = n;
    }
  }
  const more = (logs.data ?? []).length >= limit || (weights.data ?? []).length >= limit;
  return { entries, sits: sitList, names, more };
}

export function useHealthHistory(birdIds: string[], ownerId: string | null | undefined, limit = 300) {
  const ids = [...birdIds].sort();
  return useQuery({
    queryKey: ["health-history", ids.join(","), ownerId ?? "", limit],
    enabled: ids.length > 0 && ownerId !== undefined,
    queryFn: () => fetchHealthHistory(ids, ownerId ?? null, limit),
    placeholderData: (prev) => prev,
  });
}
