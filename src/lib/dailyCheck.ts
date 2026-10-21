// Client side of the daily weight & health check: what's been done today, and
// the save. The row shape comes from dailyLog.ts, shared with the full scan.
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { localDateISO } from "@/lib/localDay";
import { buildDailyLogRow, type ScanAnswers } from "@/lib/dailyLog";
import { insertWithKind } from "@/lib/checkKind";
import type { TriageResult } from "@/lib/triage";

export type Meal = "before_meal" | "after_meal" | null;

export type TodayCheck = { id: string; triage_status: string; created_at: string; reason_codes?: unknown; notes?: string | null };
export type TodayWeight = { id: string; grams: number; measured_at: string; meal_relation: string | null };
export type BirdToday = { check: TodayCheck | null; weights: TodayWeight[]; lastGrams: number | null; lastWeighedAt?: string | null };

const KEY = "daily-check-today";

function localMidnightISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Per bird: the latest health check dated today (local), today's weights, and
 *  the most recent weight ever (the faded hint in the box). */
export function useDailyCheckToday(birdIds: string[]) {
  const ids = [...birdIds].sort();
  const day = localDateISO();
  return useQuery({
    queryKey: [KEY, day, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, BirdToday>> => {
      const [logs, todayW, lastW] = await Promise.all([
        supabase.from("daily_logs").select("id, bird_id, triage_status, created_at, triage_reason_codes, notes")
          .in("bird_id", ids).eq("log_date", day).order("created_at", { ascending: false }),
        supabase.from("weight_entries").select("id, bird_id, grams, measured_at, meal_relation")
          .in("bird_id", ids).gte("measured_at", localMidnightISO()).order("measured_at", { ascending: false }),
        // Each bird's latest weight in ONE request, however big the flock:
        // embed weight_entries on birds and keep only the newest per bird.
        supabase.from("birds").select("id, weight_entries(grams, measured_at)").in("id", ids)
          .order("measured_at", { referencedTable: "weight_entries", ascending: false })
          .limit(1, { referencedTable: "weight_entries" }),
      ]);
      if (logs.error) throw logs.error;
      if (todayW.error) throw todayW.error;
      if (lastW.error) throw lastW.error;
      const lastById = new Map(((lastW.data ?? []) as any[]).map((b) => [b.id as string, (b.weight_entries?.[0] ?? null) as { grams: number; measured_at: string } | null]));
      const out: Record<string, BirdToday> = {};
      for (const id of ids) {
        const l = (logs.data ?? []).find((r: any) => r.bird_id === id) as any;
        out[id] = {
          check: l ? { id: l.id, triage_status: l.triage_status, created_at: l.created_at, reason_codes: l.triage_reason_codes, notes: l.notes } : null,
          weights: ((todayW.data ?? []) as any[]).filter((w) => w.bird_id === id),
          lastGrams: lastById.get(id)?.grams ?? null,
          lastWeighedAt: lastById.get(id)?.measured_at ?? null,
        };
      }
      return out;
    },
  });
}

export function invalidateAfterCheck(qc: QueryClient, birdId: string) {
  qc.invalidateQueries({ queryKey: [KEY] });
  qc.invalidateQueries({ queryKey: ["scan-feed"] });
  ["bird-checkins", "weight-entries", "bird-weights"].forEach((k) => qc.invalidateQueries({ queryKey: [k, birdId] }));
  qc.invalidateQueries({ queryKey: ["birds"] }); // Home pills read weights embedded in the birds query
}

export type SaveResult = { logId: string; triage: TriageResult; weightSaved: boolean; weightError: unknown };

/** Health check first, then the weight. A failed weight keeps the check. */
export async function saveDailyCheck(p: {
  birdId: string;
  answers: ScanAnswers;
  notes: string | null;
  grams: number | null;
  meal: Meal;
  source: "owner" | "household";
  sitId: string | null;
}): Promise<SaveResult> {
  const { data: u } = await getLocalUser();
  const runBy = u.user?.id ?? null;
  const { row, vomiting, triage } = buildDailyLogRow(p.answers, {
    kind: "daily", birdId: p.birdId, sitId: p.sitId, source: p.source, runBy, logDate: localDateISO(), notes: p.notes,
  });
  const { data: log, error } = await insertWithKind(row, (r) => supabase.from("daily_logs").insert(r as any).select("id").single());
  if (error) throw error;
  if (vomiting) await supabase.from("daily_logs").update({ vomiting_status: vomiting } as any).eq("id", log.id);

  let weightSaved = false;
  let weightError: unknown = null;
  if (p.grams != null) {
    const res = await saveWeight({ birdId: p.birdId, grams: p.grams, meal: p.meal, source: p.source, sitId: p.sitId, loggedBy: runBy });
    weightSaved = !res;
    weightError = res;
  }
  return { logId: log.id, triage, weightSaved, weightError };
}

/** One weight_entries row. Returns the error, or null on success. */
export async function saveWeight(p: { birdId: string; grams: number; meal: Meal; source: "owner" | "household"; sitId: string | null; loggedBy?: string | null }): Promise<unknown> {
  let loggedBy = p.loggedBy;
  if (loggedBy === undefined) {
    const { data: u } = await getLocalUser();
    loggedBy = u.user?.id ?? null;
  }
  const payload: Record<string, unknown> = { bird_id: p.birdId, grams: p.grams, source: p.source, logged_by: loggedBy };
  if (p.meal) payload.meal_relation = p.meal;
  if (p.sitId) payload.sit_id = p.sitId;
  const { error } = await supabase.from("weight_entries").insert(payload as any);
  return error ?? null;
}
