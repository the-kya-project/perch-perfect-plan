// Part B: a read-only, offline snapshot of the ACTIVE sit's care sheet, so a
// sitter who loses connection mid-sit can still read the care plan. Scoped
// strictly to the sit's token; reads only — no offline mutations.
//
// SAFETY: persists ONLY the care-sheet data the sitter already sees (the bird's
// text fields + the care plan). It strips signed media (bird photo URL) and does
// NOT store emergency contacts, owner account data, completions, or any signed
// Storage/Cloudflare URL. Cleared when the link is found revoked/expired/invalid.

const PREFIX = "kya.sitterCare.";

export type CareSnapshot = { savedAt: number; bird: any; plan: any };

function keyFor(token: string): string {
  return `${PREFIX}${token}`;
}

export function saveCareSnapshot(token: string, data: { bird: any; plan: any }): void {
  if (typeof localStorage === "undefined" || !token) return;
  try {
    // Drop the signed photo URL — never persist signed media.
    const bird = data.bird ? { ...data.bird, photo_url: null } : null;
    const snap: CareSnapshot = { savedAt: Date.now(), bird, plan: data.plan ?? null };
    localStorage.setItem(keyFor(token), JSON.stringify(snap));
  } catch {
    /* storage full / blocked (private mode) — offline read just won't be available */
  }
}

export function loadCareSnapshot(token: string): CareSnapshot | null {
  if (typeof localStorage === "undefined" || !token) return null;
  try {
    const raw = localStorage.getItem(keyFor(token));
    if (!raw) return null;
    const snap = JSON.parse(raw) as CareSnapshot;
    return snap && (snap.bird || snap.plan) ? snap : null;
  } catch {
    return null;
  }
}

export function clearCareSnapshot(token: string): void {
  if (typeof localStorage === "undefined" || !token) return;
  try { localStorage.removeItem(keyFor(token)); } catch { /* ignore */ }
}
