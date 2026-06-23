// In-app notification feed for owners. Rather than a separate table, the feed is
// derived from the scans themselves (daily_logs) — RLS already scopes these to
// the owner's birds — so every submitted scan shows up in the bell with a link
// to its detail. "Seen" state is tracked per-device in localStorage (like push):
// it's fine if the unread badge resets on another device.

import { supabase } from "@/integrations/supabase/client";

export const NOTIF_SEEN_KEY = "ppc_notif_seen_at";

export function getNotifSeenAt(): number {
  if (typeof window === "undefined") return 0;
  const v = Number(window.localStorage.getItem(NOTIF_SEEN_KEY) ?? "0");
  return Number.isFinite(v) ? v : 0;
}

export function markNotifsSeen() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIF_SEEN_KEY, String(Date.now()));
}

export type ScanFeedItem = {
  id: string;
  bird_id: string;
  triage_status: "red" | "yellow" | "green" | string;
  triage_reasons: string | null;
  notes: string | null;
  created_at: string;
  source?: string | null; // 'owner' | 'sitter'
  bird?: { name: string | null; photo_url: string | null; photo_position: string | null } | null;
  sit?: { sitter_name: string | null; sitter_email: string | null } | null;
};

export async function fetchScanFeed(): Promise<ScanFeedItem[]> {
  // Cast: daily_logs.source lands in the generated types after the owner-scans
  // migration is applied + types regenerated. Fall back without `source` so the
  // tab keeps working if the migration hasn't run yet.
  const base = "id, bird_id, triage_status, triage_reasons, notes, created_at, bird:birds(name, photo_url, photo_position), sit:sits(sitter_name, sitter_email)";
  const run = (sel: string) =>
    (supabase as any).from("daily_logs").select(sel).order("created_at", { ascending: false }).limit(40);
  const first = await run(`${base}, source`);
  let data = first.data;
  if (first.error) ({ data } = await run(base));
  return (data ?? []) as unknown as ScanFeedItem[];
}

/** Who ran a scan: "You" for owner scans, else the sitter's name/email. */
export function scanRunBy(n: ScanFeedItem): string {
  if (n.source === "owner") return "You";
  return n.sit?.sitter_name?.trim() || n.sit?.sitter_email?.trim() || "Your sitter";
}
