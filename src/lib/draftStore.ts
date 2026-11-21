/**
 * Storage for local form drafts (see drafts.ts for the hook and the rules).
 * Text in localStorage, a photo in IndexedDB. Every call is wrapped: blocked
 * or full storage just means "no draft", never an error. No app imports, so
 * scripts/drafts.test.ts can run it under Node.
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = "kya-draft:v1:";
const DB_NAME = "kya-drafts";
/** v1 held photos only; v2 adds recorded clips that haven't uploaded yet. */
const DB_VERSION = 2;
const STORE = "photos";
const CLIP_STORE = "clips";

export type DraftScope = { userId: string; birdId: string; kind: string };
/** A sitter has no account: their drafts belong to the sit link and the bird. */
export type SitDraftScope = { token: string; birdId: string; kind: string };

/** `expiresAt`: a hard end besides the 24 hours (a sitter draft's sit end). */
export type Stored<T> = { savedAt: number; data: T; hasPhoto?: boolean; expiresAt?: number | null };

export function draftKey(s: DraftScope): string {
  return `${PREFIX}${s.userId}:${s.birdId}:${s.kind}`;
}

/** Short, stable, non-reversible tag for a sit link token, so the key names
 *  the sit without copying the link's secret into storage. Not security: it
 *  only has to keep two sits on one phone apart. (cyrb53) */
export function sitTag(token: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < token.length; i++) {
    const c = token.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Owner keys start with the account's uuid; sit keys with "sit-", so the two
 *  can never collide. */
export function sitDraftKey(s: SitDraftScope): string {
  return `${PREFIX}sit-${sitTag(s.token)}:${s.birdId}:${s.kind}`;
}

/** Kept: saved within the last 24 hours and before any hard end (a sit's). */
export function isDraftFresh(savedAt: unknown, now = Date.now(), expiresAt?: number | null): boolean {
  return fresh(savedAt, now, expiresAt);
}

function fresh(savedAt: unknown, now = Date.now(), expiresAt?: number | null): boolean {
  if (typeof expiresAt === "number" && now >= expiresAt) return false;
  return typeof savedAt === "number" && now - savedAt >= 0 && now - savedAt < DRAFT_TTL_MS;
}

// ── localStorage (text) ─────────────────────────────────────────────────────

export function readDraft<T>(key: string, now = Date.now()): Stored<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || !fresh(parsed.savedAt, now, parsed.expiresAt)) {
      removeDraft(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeDraftText<T>(key: string, value: Stored<T>): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* ignore */ }
  void deletePhoto(key);
}

/** Drop every expired draft on this device (any account). Cheap: a key scan. */
export function sweepExpiredDrafts(now = Date.now()) {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PREFIX)) continue;
      try {
        const v = JSON.parse(localStorage.getItem(k) ?? "null") as Stored<unknown> | null;
        if (!v || !fresh(v.savedAt, now, v.expiresAt)) stale.push(k);
      } catch {
        stale.push(k);
      }
    }
    stale.forEach(removeDraft);
  } catch { /* ignore */ }
}

/** Remove every draft of one sit link (its link has expired or was revoked). */
export function removeSitDrafts(token: string) {
  try {
    const prefix = `${PREFIX}sit-${sitTag(token)}:`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach(removeDraft);
  } catch { /* ignore */ }
  void deleteClipDraftsWithPrefix(`${PREFIX}sit-${sitTag(token)}:`);
}

// ── IndexedDB (photo) ───────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        for (const name of [STORE, CLIP_STORE]) {
          try { if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name); } catch { /* exists */ }
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<R>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<R> | void, store = STORE): Promise<R | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<R | null>((resolve) => {
    try {
      const tx = db.transaction(store, mode);
      const req = run(tx.objectStore(store));
      tx.oncomplete = () => { db.close(); resolve(req ? (req.result as R) : null); };
      tx.onerror = () => { db.close(); resolve(null); };
      tx.onabort = () => { db.close(); resolve(null); };
    } catch {
      try { db.close(); } catch { /* ignore */ }
      resolve(null);
    }
  });
}

type StoredPhoto = { savedAt: number; dataUrl: string };

export async function savePhoto(key: string, dataUrl: string): Promise<boolean> {
  const ok = await withStore("readwrite", (s) => s.put({ savedAt: Date.now(), dataUrl } satisfies StoredPhoto, key));
  return ok !== null;
}

export async function loadPhoto(key: string): Promise<string | null> {
  const v = (await withStore<StoredPhoto | undefined>("readonly", (s) => s.get(key))) ?? null;
  if (!v || typeof v.dataUrl !== "string" || !fresh(v.savedAt)) {
    if (v) void deletePhoto(key);
    return null;
  }
  return v.dataUrl;
}

export async function deletePhoto(key: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(key));
}

// ── IndexedDB (recorded clip) ───────────────────────────────────────────────
// A clip recorded in the app but not uploaded yet (ClipRecorder). Saved the
// moment recording stops, so a reload, an app update or the OS reclaiming the
// page can't lose it. Same keys and expiry as the text drafts (account or sit
// link + bird, 24 hours, a sitter's also the sit's end); deleted once it
// uploads or is discarded.

export type ClipDraft = {
  savedAt: number;
  /** A sitter's: when the sit ends. */
  expiresAt?: number | null;
  blob: Blob;
  name: string;
  type: string;
  /** Seconds captured, when known. */
  seconds?: number | null;
};

/** Is there room for a clip this size? Leaves headroom so a full device
 *  doesn't fail the save half-way. Unknown quota: try (the put is guarded). */
export function clipFitsStorage(size: number, estimate: { quota?: number; usage?: number } | null): boolean {
  if (!estimate || typeof estimate.quota !== "number") return true;
  const free = estimate.quota - (estimate.usage ?? 0);
  return free > size * 1.5 + 5 * 1024 * 1024;
}

/** Save a recorded clip. False (and nothing kept) when storage is missing,
 *  blocked or too full; recording carries on regardless. */
export async function saveClipDraft(key: string, clip: Omit<ClipDraft, "savedAt">): Promise<boolean> {
  try {
    let estimate: { quota?: number; usage?: number } | null = null;
    try { estimate = (await navigator.storage?.estimate?.()) ?? null; } catch { estimate = null; }
    if (!clipFitsStorage(clip.blob.size, estimate)) return false;
    const value: ClipDraft = { ...clip, savedAt: Date.now() };
    const ok = await withStore("readwrite", (s) => s.put(value, key), CLIP_STORE);
    return ok !== null;
  } catch {
    return false;
  }
}

/** The saved clip, or null. An expired one is deleted, not returned. */
export async function loadClipDraft(key: string, now = Date.now()): Promise<ClipDraft | null> {
  try {
    const v = (await withStore<ClipDraft | undefined>("readonly", (s) => s.get(key), CLIP_STORE)) ?? null;
    if (!v) return null;
    if (!(v.blob instanceof Blob) || !v.blob.size || !fresh(v.savedAt, now, v.expiresAt)) {
      void deleteClipDraft(key);
      return null;
    }
    return v;
  } catch {
    return null;
  }
}

export async function deleteClipDraft(key: string): Promise<void> {
  try { await withStore("readwrite", (s) => s.delete(key), CLIP_STORE); } catch { /* ignore */ }
}

/** Walk the saved clips; delete those `drop` picks. Best-effort. */
async function pruneClips(drop: (key: string, v: ClipDraft | undefined) => boolean): Promise<void> {
  try {
    const db = await openDb();
    if (!db) return;
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(CLIP_STORE, "readwrite");
        const req = tx.objectStore(CLIP_STORE).openCursor();
        req.onsuccess = () => {
          const c = req.result;
          if (!c) return;
          try { if (drop(String(c.key), c.value as ClipDraft | undefined)) c.delete(); } catch { /* keep */ }
          c.continue();
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); resolve(); };
      } catch {
        try { db.close(); } catch { /* ignore */ }
        resolve();
      }
    });
  } catch { /* ignore */ }
}

/** Drop every expired saved clip on this device (any account or sit). */
export function sweepExpiredClipDrafts(now = Date.now()): Promise<void> {
  return pruneClips((_k, v) => !v || !fresh(v.savedAt, now, v.expiresAt));
}

function deleteClipDraftsWithPrefix(prefix: string): Promise<void> {
  return pruneClips((k) => k.startsWith(prefix));
}
