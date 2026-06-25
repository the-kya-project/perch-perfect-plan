// Derived "concerning" status for a bird, from scan history alone (no stored
// flag). A bird is concerning when its most recent FLAGGED scan (triage_status
// red/yellow) has no later all-clear (green) scan AND no resolved_at stamp.
// A later green scan, or an explicit "Mark resolved", clears it.

export type ScanRow = {
  id: string;
  bird_id: string;
  triage_status: string | null;
  created_at: string;
  resolved_at?: string | null;
  run_by?: string | null;
  runner_name?: string | null;
  source?: string | null;
  sit?: { sitter_name?: string | null; sitter_email?: string | null } | null;
};

export type BirdConcern = { birdId: string; scanId: string; createdAt: string; runByName: string };

function runnerName(s: ScanRow): string {
  return (
    s.sit?.sitter_name?.trim() ||
    s.sit?.sitter_email?.trim() ||
    s.runner_name?.trim() ||
    "you"
  );
}

// `scansDesc` must be newest-first (any set of birds). Returns the active
// concern per bird, or nothing for birds that are clear.
export function deriveConcernByBird(scansDesc: ScanRow[]): Map<string, BirdConcern> {
  const byBird = new Map<string, ScanRow[]>();
  for (const s of scansDesc) {
    const arr = byBird.get(s.bird_id);
    if (arr) arr.push(s);
    else byBird.set(s.bird_id, [s]);
  }
  const out = new Map<string, BirdConcern>();
  for (const [birdId, scans] of byBird) {
    for (const s of scans) {
      // newest-first → the first decisive scan wins.
      if (s.triage_status === "green") break; // most recent all-clear → clear
      if (s.triage_status === "red" || s.triage_status === "yellow") {
        if (s.resolved_at) break; // explicitly resolved → clear
        out.set(birdId, { birdId, scanId: s.id, createdAt: s.created_at, runByName: runnerName(s) });
        break;
      }
    }
  }
  return out;
}

// Whole days since an ISO timestamp (0 = today).
export function daysAgo(iso: string, now = new Date()): number {
  const then = new Date(iso);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate());
  return Math.max(0, Math.round((+a - +b) / 86_400_000));
}
