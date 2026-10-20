// The bell's Updates list. Nothing new is stored: every update is worked out
// from data the app already keeps, over the last 60 days.
//   - A sitter flagged something: daily_logs (source 'sitter', not green).
//   - A sitter finished the day's checks: every bird on the sit has a sitter
//     check that day (daily_logs by sit_id + log_date).
//   - Weigh-in due: the bird's last weight is older than Home's threshold.
//   - Care plan review before a sit: the reminder the daily job sent
//     (notification_log, type 'care_plan_reminder', ref_id = the sit).
//   - Someone joined the household: their first bird_members row.
// Read state is per device (localStorage), like the old bell.
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { fetchBirdList } from "@/lib/birdListSelect";
import { getHouseholdAccount } from "@/lib/household.functions";
import { daysSince, staleThreshold } from "@/lib/homeData";
import { localDateISO } from "@/lib/localDay";

export const UPDATE_DAYS = 60;
const DAY_MS = 86_400_000;

export type UpdateKind = "flag" | "finished" | "weigh" | "careplan" | "joined";
export type Update = {
  id: string;
  kind: UpdateKind;
  at: string; // ISO
  // Raw facts; the screen composes the copy.
  sitterName?: string;
  birdNames?: string[];
  birdId?: string;
  scanId?: string;
  sitId?: string;
  reasonCodes?: unknown;
  weights?: number;
  sitStart?: string;
  memberName?: string;
};

type Sit = { id: string; sitter_name: string | null; sitter_email: string | null; caregiver_user_id: string | null; start_date: string; end_date: string; birdIds: string[] };
type Log = { id: string; bird_id: string; sit_id: string | null; created_at: string; log_date: string; triage_status: string; triage_reason_codes: unknown };
type Weight = { bird_id: string; sit_id: string | null; measured_at: string };
type Bird = { id: string; name: string; is_foster: boolean | null; lastWeighedAt: string | null };
type Reminder = { id: string; bird_id: string | null; ref_id: string | null; sent_at: string };
type Member = { userId: string; name: string | null; email: string | null; since: string | null };

export type UpdateSources = { birds: Bird[]; sits: Sit[]; logs: Log[]; weights: Weight[]; reminders: Reminder[]; members: Member[] };

function sitterLabel(s: Sit | undefined): string {
  return s?.sitter_name?.trim() || s?.sitter_email?.trim() || "";
}

/** Every update, newest first. Pure: `now` is passed in. */
export function deriveUpdates(src: UpdateSources, now: Date = new Date()): Update[] {
  const since = now.getTime() - UPDATE_DAYS * DAY_MS;
  const inWindow = (iso: string) => new Date(iso).getTime() >= since;
  const birdName = new Map(src.birds.map((b) => [b.id, b.name]));
  const sitById = new Map(src.sits.map((s) => [s.id, s]));
  const out: Update[] = [];

  // Sitter flagged something.
  for (const l of src.logs) {
    if (l.triage_status === "green" || !inWindow(l.created_at)) continue;
    out.push({
      id: `flag:${l.id}`, kind: "flag", at: l.created_at,
      sitterName: sitterLabel(sitById.get(l.sit_id ?? "")), birdNames: [birdName.get(l.bird_id) ?? ""],
      birdId: l.bird_id, scanId: l.id, reasonCodes: l.triage_reason_codes,
    });
  }

  // Sitter finished the day's checks (every active bird on the sit).
  const byDay = new Map<string, Log[]>();
  for (const l of src.logs) {
    if (!l.sit_id) continue;
    const k = `${l.sit_id}|${l.log_date}`;
    byDay.set(k, [...(byDay.get(k) ?? []), l]);
  }
  for (const [k, logs] of byDay) {
    const [sitId, day] = k.split("|");
    const sit = sitById.get(sitId);
    if (!sit) continue;
    const birds = sit.birdIds.filter((id) => birdName.has(id));
    if (!birds.length || !birds.every((id) => logs.some((l) => l.bird_id === id))) continue;
    const at = logs.reduce((m, l) => (l.created_at > m ? l.created_at : m), logs[0].created_at);
    if (!inWindow(at)) continue;
    const weights = src.weights.filter((w) => birds.includes(w.bird_id) && localDateISO(new Date(w.measured_at)) === day
      && (w.sit_id === sitId || (!w.sit_id && sit.start_date <= day && day <= sit.end_date))).length;
    out.push({ id: `finished:${sitId}:${day}`, kind: "finished", at, sitterName: sitterLabel(sit), sitId, birdNames: birds.map((id) => birdName.get(id) ?? ""), weights });
  }

  // Weigh-in due (Home's rule: past the bird's threshold; never-weighed birds skipped).
  const due = src.birds
    .filter((b) => b.lastWeighedAt && daysSince(b.lastWeighedAt, now) > staleThreshold(b.is_foster))
    .map((b) => ({ b, dueAt: new Date(new Date(b.lastWeighedAt!).getTime() + (staleThreshold(b.is_foster) + 1) * DAY_MS) }))
    .sort((a, c) => a.b.name.localeCompare(c.b.name));
  if (due.length) {
    const first = due.reduce((m, d) => (d.dueAt < m ? d.dueAt : m), due[0].dueAt);
    out.push({
      id: `weigh:${due.map((d) => d.b.id).sort().join(",")}:${localDateISO(first)}`, kind: "weigh",
      at: (first.getTime() > now.getTime() ? now : first).toISOString(),
      birdNames: due.map((d) => d.b.name), birdId: due.length === 1 ? due[0].b.id : undefined,
    });
  }

  // Care plan review before a sit (the reminder that was sent).
  for (const r of src.reminders) {
    if (!inWindow(r.sent_at)) continue;
    const sit = sitById.get(r.ref_id ?? "");
    out.push({
      id: `careplan:${r.id}`, kind: "careplan", at: r.sent_at, birdId: r.bird_id ?? undefined,
      birdNames: [birdName.get(r.bird_id ?? "") ?? ""], sitterName: sitterLabel(sit), sitStart: sit?.start_date, sitId: sit?.id,
    });
  }

  // Someone joined the household.
  for (const m of src.members) {
    if (!m.since || !inWindow(m.since)) continue;
    out.push({ id: `joined:${m.userId}`, kind: "joined", at: m.since, memberName: m.name?.trim() || m.email || "" });
  }

  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

// ---- Read state (per device) ----

const READ_KEY = "kya_updates_read";
type ReadState = { ids: string[]; allBefore: number };
const listeners = new Set<() => void>();
let cache: ReadState | null = null;

function readState(): ReadState {
  if (cache) return cache;
  let s: ReadState = { ids: [], allBefore: 0 };
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(READ_KEY) : null;
    if (raw) s = { ids: [], allBefore: 0, ...JSON.parse(raw) };
  } catch { /* private mode or bad JSON: start empty */ }
  cache = s;
  return s;
}
function writeState(next: ReadState) {
  cache = next;
  try { window.localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function isRead(u: Update, s: ReadState): boolean {
  return s.ids.includes(u.id) || new Date(u.at).getTime() <= s.allBefore;
}

// ---- Hook ----

export function useUpdates() {
  const getHousehold = useServerFn(getHouseholdAccount);
  const { data: birdsRaw } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return data ?? [];
    },
  });
  const birds: Bird[] = ((birdsRaw ?? []) as any[]).map((b) => ({
    id: b.id, name: b.name, is_foster: b.is_foster ?? null,
    lastWeighedAt: ((b.weight_entries ?? []) as { measured_at: string }[])[0]?.measured_at ?? null,
  }));
  const ids = birds.map((b) => b.id).sort();

  const { data: rest } = useQuery({
    queryKey: ["updates-sources", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      const me = u.user?.id ?? null;
      const from = new Date(Date.now() - UPDATE_DAYS * DAY_MS).toISOString();
      const fromDay = from.slice(0, 10);
      const [logs, weights, sits, reminders] = await Promise.all([
        supabase.from("daily_logs").select("id, bird_id, sit_id, created_at, log_date, triage_status, triage_reason_codes")
          .in("bird_id", ids).eq("source", "sitter").gte("created_at", from).order("created_at", { ascending: false }).limit(500),
        supabase.from("weight_entries").select("bird_id, sit_id, measured_at")
          .in("bird_id", ids).eq("source", "sitter").gte("measured_at", from).limit(500),
        me
          ? supabase.from("sits").select("id, sitter_name, sitter_email, caregiver_user_id, start_date, end_date, sit_birds(bird_id)")
              .eq("owner_id", me).gte("end_date", fromDay)
          : Promise.resolve({ data: [], error: null } as any),
        me
          ? supabase.from("notification_log").select("id, bird_id, ref_id, sent_at")
              .eq("user_id", me).eq("type", "care_plan_reminder").gte("sent_at", from).limit(100)
          : Promise.resolve({ data: [], error: null } as any),
      ]);
      return {
        logs: (logs.data ?? []) as Log[],
        weights: (weights.data ?? []) as Weight[],
        sits: ((sits.data ?? []) as any[]).map((s) => ({ ...s, birdIds: ((s.sit_birds ?? []) as any[]).map((x) => x.bird_id) })) as Sit[],
        reminders: (reminders.data ?? []) as Reminder[],
      };
    },
  });
  const { data: household } = useQuery({ queryKey: ["household-account"], queryFn: () => getHousehold(), staleTime: 5 * 60_000 });

  const read = useSyncExternalStore(subscribe, readState, () => ({ ids: [], allBefore: 0 }));
  const items = useMemo(() => deriveUpdates({
    birds,
    sits: rest?.sits ?? [], logs: rest?.logs ?? [], weights: rest?.weights ?? [], reminders: rest?.reminders ?? [],
    members: ((household?.members ?? []) as Member[]),
  }), [birdsRaw, rest, household]); // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = useCallback((id: string) => {
    const s = readState();
    if (!s.ids.includes(id)) writeState({ ...s, ids: [...s.ids, id].slice(-500) });
  }, []);
  const markAllRead = useCallback(() => writeState({ ids: [], allBefore: Date.now() }), []);

  return {
    items,
    loading: !rest && ids.length > 0,
    isRead: (u: Update) => isRead(u, read),
    unread: items.filter((u) => !isRead(u, read)).length,
    markRead,
    markAllRead,
  };
}
