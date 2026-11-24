// Buddy pods (backlog 1.11). Data and the pure helpers
// scripts/flock-shell.test.ts pins. Reads and writes go through database
// functions (20261124070000_flock_buddy_pods.sql), which decide who's in a
// pod, what members see of each other (never progress from a "Just me"
// journey outside the household) and when a pod forms, closes or ends.
// Flock code only.
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FlockPost } from "@/lib/flockPostData";
import type { ReactionKind } from "@/lib/journeyData";

const sb = supabase as any;
const STALE = 30_000;
const PAGE = 15;
function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** The same numbers the database uses. */
export const POD_MIN = 3;
export const POD_MAX = 6;
export const PODS_AT_ONCE = 2;

export type PodKind = "journey" | "group";
export type PodStatus = "active" | "asking" | "closed" | "dissolved";
export type JourneyPodState = { state: "pod" | "waiting" | "offer" | "none"; pod_id: string | null; waiting: number; can_wait: boolean };
export type Pod = {
  pod_id: string; kind: PodKind; status: PodStatus; template_slug: string; template_name: string; region_name: string | null;
  member_count: number; my_journey_id: string | null; my_finished: boolean; asking_me: boolean; my_answer: boolean | null;
  checked_in_this_week: boolean; offered_new: boolean; created_at: string;
};
export type PodMember = {
  user_id: string; display_name: string | null; photo_path: string | null; is_me: boolean;
  bird_id: string | null; bird_name: string | null; bird_has_photo: boolean;
  /** Null when the member's journey is "Just me" and you're not in its household. */
  done: number | null; total: number | null; finished: boolean | null;
};
export type MyPodRow = {
  pod_id: string | null; journey_id: string | null; kind: PodKind | "waiting"; status: PodStatus | "waiting";
  template_slug: string; template_name: string; region_name: string | null; member_count: number; created_at: string;
};
export type AdminPodRow = {
  pod_id: string; kind: PodKind; status: PodStatus; template_slug: string; template_name: string; region_name: string | null;
  member_count: number; last_post_at: string | null; created_at: string; ended_at: string | null;
};
export type AdminPodMember = { user_id: string; display_name: string | null; region_name: string | null; journey_status: string | null; joined_at: string; left_at: string | null };
export type AdminPodWait = { template_slug: string; template_name: string; waiting: number; oldest: string };

export const podKeys = {
  all: ["flock", "pods"] as const,
  canWait: ["flock", "pods", "can-wait"] as const,
  journey: (id: string) => ["flock", "pods", "journey", id] as const,
  mine: ["flock", "pods", "mine"] as const,
  one: (id: string) => ["flock", "pods", "one", id] as const,
  members: (id: string) => ["flock", "pods", "members", id] as const,
  feed: (id: string) => ["flock", "pods", "feed", id] as const,
  admin: ["flock", "pods", "admin"] as const,
  adminMembers: (id: string) => ["flock", "pods", "admin", "members", id] as const,
  adminWaits: ["flock", "pods", "admin", "waits"] as const,
};

// ---- Pure helpers ---------------------------------------------------------------------

/** A member's progress bar, 0–100, or null when it isn't shown. */
export function podProgress(m: Pick<PodMember, "done" | "total" | "finished">): number | null {
  if (m.done == null || m.total == null) return null;
  if (m.finished) return 100;
  if (m.total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((m.done / m.total) * 100)));
}

/** Can you post in this pod? Ended pods stay readable but take no posts. */
export function podOpen(status: PodStatus): boolean {
  return status === "active" || status === "asking";
}

/** Show the weekly "How did … go?" card: an open pod you haven't posted in this week. */
export function showWeeklyCard(pod: Pick<Pod, "status" | "checked_in_this_week" | "asking_me">): boolean {
  return podOpen(pod.status) && !pod.checked_in_this_week && !pod.asking_me;
}

/** Waiting for buddies: how many more are needed before a pod starts. */
export function podStillNeeded(waiting: number): number {
  return Math.max(0, POD_MIN - Math.max(1, waiting));
}

/** The first letter for a member without a photo. */
export function podInitial(name: string | null | undefined): string {
  const s = (name ?? "").trim();
  return s ? s[0]!.toUpperCase() : "?";
}

const asBool = (v: unknown) => v === true;
export function cleanPod(row: any): Pod {
  return {
    pod_id: String(row?.pod_id ?? ""),
    kind: row?.kind === "group" ? "group" : "journey",
    status: (["active", "asking", "closed", "dissolved"] as const).includes(row?.status) ? row.status : "closed",
    template_slug: String(row?.template_slug ?? ""),
    template_name: String(row?.template_name ?? ""),
    region_name: row?.region_name ? String(row.region_name) : null,
    member_count: Number(row?.member_count ?? 0),
    my_journey_id: row?.my_journey_id ? String(row.my_journey_id) : null,
    my_finished: asBool(row?.my_finished),
    asking_me: asBool(row?.asking_me),
    my_answer: row?.my_answer === true ? true : row?.my_answer === false ? false : null,
    checked_in_this_week: asBool(row?.checked_in_this_week),
    offered_new: asBool(row?.offered_new),
    created_at: String(row?.created_at ?? ""),
  };
}

/** Why the database refused, as a key the screens turn into words. */
export type PodRefusal = "limit" | "closed" | "full" | "blocked" | "other";
export function podRefusal(e: unknown): PodRefusal {
  const msg = String((e as { message?: string })?.message ?? "");
  if (/pod_limit/.test(msg)) return "limit";
  if (/pod_closed|journey_not_open/.test(msg)) return "closed";
  if (/pod_full/.test(msg)) return "full";
  if (/pod_blocked/.test(msg)) return "blocked";
  return "other";
}

// ---- Reads ----------------------------------------------------------------------------

export function usePodCanWait(enabled = true) {
  return useQuery({
    queryKey: podKeys.canWait,
    enabled,
    staleTime: STALE,
    queryFn: async (): Promise<boolean> => must(await sb.rpc("flock_pod_can_wait")) === true,
  });
}

export function useJourneyPod(journeyId: string, enabled: boolean) {
  return useQuery({
    queryKey: podKeys.journey(journeyId),
    enabled: enabled && !!journeyId,
    staleTime: STALE,
    queryFn: async (): Promise<JourneyPodState | null> => asArray<JourneyPodState>(must(await sb.rpc("flock_pod_for_journey", { p_journey_id: journeyId })))[0] ?? null,
  });
}

export function useMyPods() {
  return useQuery({
    queryKey: podKeys.mine,
    staleTime: STALE,
    queryFn: async (): Promise<MyPodRow[]> => asArray<MyPodRow>(must(await sb.rpc("flock_my_pods"))),
  });
}

export function usePod(podId: string) {
  return useQuery({
    queryKey: podKeys.one(podId),
    enabled: !!podId,
    staleTime: STALE,
    queryFn: async (): Promise<Pod | null> => {
      const row = asArray<any>(must(await sb.rpc("flock_pod", { p_pod_id: podId })))[0];
      return row ? cleanPod(row) : null;
    },
  });
}

export function usePodMembers(podId: string, enabled: boolean) {
  return useQuery({
    queryKey: podKeys.members(podId),
    enabled: enabled && !!podId,
    staleTime: STALE,
    queryFn: async (): Promise<PodMember[]> => asArray<PodMember>(must(await sb.rpc("flock_pod_members", { p_pod_id: podId }))),
  });
}

/** The pod's posts, newest first, a page at a time (the same rows as Today). */
export function usePodFeed(podId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: podKeys.feed(podId),
    enabled: enabled && !!podId,
    staleTime: STALE,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<FlockPost[]> =>
      asArray<FlockPost>(must(await sb.rpc("flock_pod_feed", { p_pod_id: podId, p_before: pageParam, p_limit: PAGE })))
        .map((r) => ({ ...r, mine: asArray<ReactionKind>(r.mine) })),
    getNextPageParam: (last) => (last.length < PAGE ? undefined : last[last.length - 1].created_at),
  });
}

export function useAdminPods(enabled: boolean) {
  return useQuery({
    queryKey: podKeys.admin,
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminPodRow[]> => asArray<AdminPodRow>(must(await sb.rpc("admin_pods"))),
  });
}

export function useAdminPodMembers(podId: string | null) {
  return useQuery({
    queryKey: podKeys.adminMembers(podId ?? ""),
    enabled: !!podId,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminPodMember[]> => asArray<AdminPodMember>(must(await sb.rpc("admin_pod_members", { p_pod_id: podId }))),
  });
}

export function useAdminPodWaits(enabled: boolean) {
  return useQuery({
    queryKey: podKeys.adminWaits,
    enabled,
    staleTime: 15_000,
    queryFn: async (): Promise<AdminPodWait[]> => asArray<AdminPodWait>(must(await sb.rpc("admin_pod_waitlist"))),
  });
}

// ---- Writes ---------------------------------------------------------------------------

export async function podWait(journeyId: string): Promise<{ state: "pod" | "waiting"; pod_id: string | null }> {
  return asArray<{ state: "pod" | "waiting"; pod_id: string | null }>(must(await sb.rpc("flock_pod_wait", { p_journey_id: journeyId })))[0];
}

export async function podUnwait(journeyId: string): Promise<void> {
  must(await sb.rpc("flock_pod_unwait", { p_journey_id: journeyId }));
}

export async function createPodPost(input: {
  podId: string; title: string; body: string; photoPaths: string[]; birdId: string | null; vetNudged: boolean;
}): Promise<{ post_id: string }> {
  return asArray<{ post_id: string }>(must(await sb.rpc("flock_pod_post_create", {
    p_pod_id: input.podId, p_title: input.title.trim() || null, p_body: input.body, p_photo_paths: input.photoPaths,
    p_bird_id: input.birdId, p_vet_nudged: input.vetNudged,
  })))[0];
}

export async function leavePod(podId: string): Promise<void> {
  must(await sb.rpc("flock_pod_leave", { p_pod_id: podId }));
}

export async function podFinishedSeen(podId: string): Promise<void> {
  must(await sb.rpc("flock_pod_finished_seen", { p_pod_id: podId }));
}

export async function podKeepGoing(podId: string, yes: boolean): Promise<void> {
  must(await sb.rpc("flock_pod_keep_going", { p_pod_id: podId, p_yes: yes }));
}

export async function adminMovePodMember(userId: string, from: string, to: string): Promise<void> {
  must(await sb.rpc("admin_pod_move", { p_user_id: userId, p_from: from, p_to: to }));
}

export async function adminDissolvePod(podId: string): Promise<void> {
  must(await sb.rpc("admin_pod_dissolve", { p_pod_id: podId }));
}

/** After a change: pods reload, and Today and posts too (pod posts are posts). */
export function useInvalidatePods() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: podKeys.all }),
      qc.invalidateQueries({ queryKey: ["flock", "posts"] }),
    ]);
  };
}
