// Reporting, the review queue and Community notifications (step 4B). Every
// read and write goes through a database function that checks who may do it
// (20261108110000_flock_moderation.sql). Flock code only.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;

function must<T>(r: { data: T; error: unknown }): T {
  if (r.error) throw r.error;
  return r.data;
}
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export type ReportSubject = "post" | "comment" | "journey_update";
export type ReportReason = "unkind" | "unsafe" | "spam" | "other";
export const REPORT_REASONS: ReportReason[] = ["unkind", "unsafe", "spam", "other"];

export async function report(type: ReportSubject, id: string, reason: ReportReason, note: string): Promise<void> {
  must(await sb.rpc("flock_report", { p_subject_type: type, p_subject_id: id, p_reason: reason, p_note: note.trim() || null }));
}

// ---- Notifications ------------------------------------------------------------------------

export type NotificationFilter = "all" | "replies" | "cheers" | "chapter";
export const NOTIFICATION_FILTERS: NotificationFilter[] = ["all", "replies", "cheers", "chapter"];
export type FlockNotification = {
  ids: string[]; kind: "reply" | "cheer" | "review" | "clip" | "chapter" | "notice"; actor_name: string | null; others: number;
  subject_type: "post" | "comment" | "journey_update" | "journey_milestone"; subject_id: string; detail: string | null; note: string | null;
  post_id: string | null; post_title: string | null; post_space: string | null; journey_id: string | null; bird_name: string | null;
  skill: string | null; milestone_title: string | null; region_name: string | null; created_at: string; unread: boolean;
};

export const moderationKeys = {
  notifications: (f: NotificationFilter) => ["flock", "notifications", f] as const,
  unread: ["flock", "notifications", "unread"] as const,
  queue: (f: string) => ["flock", "review", "queue", f] as const,
  counts: ["flock", "review", "counts"] as const,
  canReview: ["flock", "review", "can"] as const,
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
  | null {
  if (n.subject_type === "journey_update" && n.journey_id) {
    return { to: "/flock/journeys/$journeyId/story", params: { journeyId: n.journey_id }, search: { u: n.subject_id } };
  }
  if (n.post_id) return { to: "/flock/post/$postId", params: { postId: n.post_id } };
  if (n.journey_id) return { to: "/flock/journeys/$journeyId", params: { journeyId: n.journey_id } };
  return null;
}

// ---- The review queue ---------------------------------------------------------------------

export type QueueFilter = "all" | "good" | "reports";
export const QUEUE_FILTERS: QueueFilter[] = ["all", "good", "reports"];
export type QueueItem = {
  item_type: "good" | "report"; subject_type: ReportSubject; subject_id: string; author_id: string; author_name: string | null;
  author_region: string | null; title: string | null; body: string | null; photo_count: number; created_at: string;
  report_count: number; reasons: ReportReason[]; notes: string[]; hidden: boolean; removed: boolean; messaged_at: string | null;
  post_id: string | null; journey_id: string | null;
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

export function useReviewCounts(enabled: boolean) {
  return useQuery({
    queryKey: moderationKeys.counts,
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<{ good: number; reports: number }> =>
      asArray<{ good: number; reports: number }>(must(await sb.rpc("flock_review_counts")))[0] ?? { good: 0, reports: 0 },
  });
}

export async function reviewPost(id: string, decision: "approve" | "changes" | "decline", note: string): Promise<void> {
  must(await sb.rpc("flock_review_post", { p_post_id: id, p_decision: decision, p_note: note.trim() || null }));
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
    ]);
  };
}
