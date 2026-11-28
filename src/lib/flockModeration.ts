// Reporting, the review queue and Community notifications (step 4B). Every
// read and write goes through a database function that checks who may do it
// (20261108110000_flock_moderation.sql). Flock code only.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PostSpace } from "@/lib/flockPosts";

const sb = supabase as any;

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** "journey" is a member skill (another member's own skill, 1.20c). */
export type ReportSubject = "post" | "comment" | "journey_update" | "journey";
/** Every reason a stored flag can carry. "unkind" and "unsafe" are the old
 *  report reasons: kept for existing flags (the review queue still names
 *  them), never offered again (20261128220000_flock_flag_reasons.sql). */
export type ReportReason = "harmful" | "care_standards" | "spam" | "other" | "unkind" | "unsafe";
/** The flag sheet's reasons, in order (approved mockup 05). */
export type FlagReason = "harmful" | "care_standards" | "spam" | "other";
export const FLAG_REASONS: FlagReason[] = ["harmful", "care_standards", "spam", "other"];

/** Send a flag to the Kya team (flock_report: private, once per person per
 *  thing; enough open flags hide it until reviewed). */
export async function report(type: ReportSubject, id: string, reason: FlagReason, note: string): Promise<void> {
  must(await sb.rpc("flock_report", { p_subject_type: type, p_subject_id: id, p_reason: reason, p_note: note.trim() || null }));
}

// ---- Notifications ------------------------------------------------------------------------

export type NotificationFilter = "all" | "replies" | "cheers" | "chapter";
export const NOTIFICATION_FILTERS: NotificationFilter[] = ["all", "replies", "cheers", "chapter"];
export type FlockNotification = {
  ids: string[]; kind: "reply" | "cheer" | "review" | "clip" | "chapter" | "notice" | "event"; actor_name: string | null; others: number;
  subject_type: "post" | "comment" | "journey_update" | "journey_milestone" | "journey" | "event"; subject_id: string; detail: string | null; note: string | null;
  post_id: string | null; post_title: string | null; post_space: string | null; journey_id: string | null; bird_name: string | null;
  skill: string | null; milestone_title: string | null; region_name: string | null;
  event_id: string | null; event_title: string | null; event_starts_at: string | null; created_at: string; unread: boolean;
};

export const moderationKeys = {
  notifications: (f: NotificationFilter) => ["flock", "notifications", f] as const,
  unread: ["flock", "notifications", "unread"] as const,
  queue: (f: string) => ["flock", "review", "queue", f] as const,
  counts: ["flock", "review", "counts"] as const,
  canReview: ["flock", "review", "can"] as const,
  spaces: ["flock", "review", "spaces"] as const,
};

export function useNotifications(filter: NotificationFilter) {
  return useQuery({
    queryKey: moderationKeys.notifications(filter),
    staleTime: 15_000,
    queryFn: async (): Promise<FlockNotification[]> =>
      asArray<FlockNotification>(must(await sb.rpc("flock_notifications_list", { p_filter: filter, p_limit: 60 })))
        .map((n) => ({ ...n, ids: asArray<string>(n.ids) })),
  });
}

export async function markNotificationsRead(ids: string[] | null): Promise<void> {
  must(await sb.rpc("flock_notifications_mark_read", { p_ids: ids }));
}

/** "Today" for anything since local midnight, else "Earlier". */
export function notificationGroup(iso: string, now: Date = new Date()): "today" | "earlier" {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return new Date(iso).getTime() >= midnight ? "today" : "earlier";
}

/** Where tapping a notification goes. */
export function notificationTarget(n: FlockNotification):
  | { to: "/flock/post/$postId"; params: { postId: string } }
  | { to: "/flock/journeys/$journeyId"; params: { journeyId: string } }
  | { to: "/flock/journeys/$journeyId/story"; params: { journeyId: string }; search: { u: string } }
  | { to: "/flock/events/$eventId"; params: { eventId: string } }
  | null {
  if (n.subject_type === "event") return { to: "/flock/events/$eventId", params: { eventId: n.subject_id } };
  if (n.subject_type === "journey_update" && n.journey_id) {
    return { to: "/flock/journeys/$journeyId/story", params: { journeyId: n.journey_id }, search: { u: n.subject_id } };
  }
  if (n.post_id) return { to: "/flock/post/$postId", params: { postId: n.post_id } };
  if (n.journey_id) return { to: "/flock/journeys/$journeyId", params: { journeyId: n.journey_id } };
  return null;
}

// ---- The review queue ---------------------------------------------------------------------

export type QueueFilter = "all" | "good" | "events" | "places" | "rescues" | "reports";
/** "rescues" (backlog 1.16) is shown to admins only: chapter leads can't review adoptions. */
export const QUEUE_FILTERS: QueueFilter[] = ["all", "good", "events", "places", "rescues", "reports"];
export type QueueItem = {
  item_type: "good" | "report" | "event"; subject_type: ReportSubject | "event"; subject_id: string; author_id: string; author_name: string | null;
  author_region: string | null; title: string | null; body: string | null; photo_count: number; created_at: string;
  report_count: number; reasons: ReportReason[]; notes: string[]; hidden: boolean; removed: boolean; messaged_at: string | null;
  post_id: string | null; journey_id: string | null;
  event_starts_at: string | null; event_mode: "in_person" | "online" | null; event_place: string | null; event_kind: "meetup" | "volunteer" | null;
};

export function useCanReview(enabled = true) {
  return useQuery({
    queryKey: moderationKeys.canReview,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await sb.rpc("flock_can_review");
      return !error && data === true;
    },
  });
}

export function useReviewQueue(filter: QueueFilter, enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.queue(filter),
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<QueueItem[]> =>
      asArray<QueueItem>(must(await sb.rpc("flock_review_queue", { p_filter: filter })))
        .map((q) => ({ ...q, reasons: asArray<ReportReason>(q.reasons), notes: asArray<string>(q.notes) })),
  });
}

export type ReviewPostSpace = { post_id: string; space: PostSpace; chapter_name: string | null };

/** The space of each post in the queue (a reported post, or the post a
 *  reported comment is on): flock_review_post_spaces, reviewers only. */
export function useReviewPostSpaces(items: QueueItem[] | undefined, enabled: boolean) {
  const ids = [...new Set((items ?? []).map((q) => (q.item_type === "report" ? q.post_id : null)).filter((id): id is string => !!id))].sort();
  return useQuery({
    queryKey: [...moderationKeys.spaces, ids] as const,
    enabled: enabled && ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, ReviewPostSpace>> =>
      new Map(asArray<ReviewPostSpace>(must(await sb.rpc("flock_review_post_spaces", { p_post_ids: ids }))).map((s) => [s.post_id, s])),
  });
}

/** Where a queue item lives: a post space (with its chapter's name), a
 *  chapter (events), Journeys (journey updates and comments on them), or
 *  null while a reported post's space is still loading. */
export type QueuePlace =
  | { kind: "space"; space: PostSpace; chapter: string | null }
  | { kind: "chapter"; chapter: string }
  | { kind: "journeys" };

export function queueItemPlace(q: QueueItem, spaces: Map<string, ReviewPostSpace> | undefined): QueuePlace | null {
  if (q.item_type === "good") return { kind: "space", space: "good", chapter: null };
  if (q.item_type === "event") return q.author_region ? { kind: "chapter", chapter: q.author_region } : null;
  if (q.post_id) {
    const s = spaces?.get(q.post_id);
    return s ? { kind: "space", space: s.space, chapter: s.chapter_name } : null;
  }
  if (q.journey_id) return { kind: "journeys" };
  return null;
}

export function useReviewCounts(enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.counts,
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<{ good: number; reports: number; events: number }> =>
      asArray<{ good: number; reports: number; events: number }>(must(await sb.rpc("flock_review_counts")))[0] ?? { good: 0, reports: 0, events: 0 },
  });
}

export async function reviewPost(id: string, decision: "approve" | "changes" | "decline", note: string): Promise<void> {
  must(await sb.rpc("flock_review_post", { p_post_id: id, p_decision: decision, p_note: note.trim() || null }));
}

export async function reviewEvent(id: string, decision: "approve" | "changes" | "decline", note: string): Promise<void> {
  must(await sb.rpc("flock_review_event", { p_event_id: id, p_decision: decision, p_note: note.trim() || null }));
}

export async function resolveReport(type: ReportSubject, id: string, action: "remove" | "keep" | "message", note: string): Promise<void> {
  must(await sb.rpc("flock_resolve_report", { p_subject_type: type, p_subject_id: id, p_action: action, p_note: note.trim() || null }));
}

export function useInvalidateModeration() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["flock", "review"] }),
      qc.invalidateQueries({ queryKey: ["flock", "notifications"] }),
      qc.invalidateQueries({ queryKey: ["flock", "posts"] }),
      qc.invalidateQueries({ queryKey: ["flock", "events"] }),
    ]);
  };
}
