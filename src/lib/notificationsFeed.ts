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
  source?: string | null; // 'owner' | 'sitter' | 'household'
  run_by?: string | null; // user id for owner/household scans
  runner_name?: string | null; // resolved display name for household scans
  resolved_at?: string | null; // set when a flagged scan is explicitly resolved
  bird?: { name: string | null; photo_url: string | null; photo_position: string | null } | null;
  sit?: { sitter_name: string | null; sitter_email: string | null } | null;
};

export async function fetchScanFeed(): Promise<ScanFeedItem[]> {
  // Cast: daily_logs.source/run_by land in the generated types after the
  // owner-scans migration. Fall back without them if not present.
  const base = "id, bird_id, triage_status, triage_reasons, notes, created_at, bird:birds(name, photo_url, photo_position), sit:sits(sitter_name, sitter_email)";
  const run = (sel: string) =>
    (supabase as any).from("daily_logs").select(sel).order("created_at", { ascending: false }).limit(40);
  // 3-tier fallback so a missing column never breaks the feed: full (with the
  // new resolved_at), then source/run_by only (pre-resolved_at migration), then
  // the bare base.
  const full = await run(`${base}, source, run_by, resolved_at`);
  let data = full.data;
  if (full.error) {
    const mid = await run(`${base}, source, run_by`);
    data = mid.data;
    if (mid.error) ({ data } = await run(base));
  }
  const items = (data ?? []) as unknown as ScanFeedItem[];

  // Resolve names for household-run scans ("Daniel · household").
  const ids = Array.from(new Set(items.filter((n) => n.source === "household" && n.run_by).map((n) => n.run_by as string)));
  if (ids.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    const byId = new Map((profs ?? []).map((p: any) => [p.id, (p.display_name ?? "").toString().trim()]));
    for (const n of items) if (n.source === "household" && n.run_by) n.runner_name = byId.get(n.run_by) || null;
  }
  return items;
}

/** Who ran a scan: "You" for owner scans, the member's name for household, else the sitter. */
export function scanRunBy(n: ScanFeedItem): string {
  if (n.source === "owner") return "You";
  if (n.source === "household") return n.runner_name?.trim() || "A household member";
  return n.sit?.sitter_name?.trim() || n.sit?.sitter_email?.trim() || "Your sitter";
}
