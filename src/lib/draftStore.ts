/**
 * Storage for local form drafts (see drafts.ts for the hook and the rules).
 * Text in localStorage, a photo in IndexedDB. Every call is wrapped: blocked
 * or full storage just means "no draft", never an error. No app imports, so
 * scripts/drafts.test.ts can run it under Node.
 */
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const PREFIX = "kya-draft:v1:";
const DB_NAME = "kya-drafts";
const STORE = "photos";

export type DraftScope = { userId: string; birdId: string; kind: string };

export type Stored<T> = { savedAt: number; data: T; hasPhoto?: boolean };

export function draftKey(s: DraftScope): string {
  return `${PREFIX}${s.userId}:${s.birdId}:${s.kind}`;
}

function fresh(savedAt: unknown, now = Date.now()): boolean {
  return typeof savedAt === "number" && now - savedAt >= 0 && now - savedAt < DRAFT_TTL_MS;
}

// ── localStorage (text) ─────────────────────────────────────────────────────

export function readDraft<T>(key: string, now = Date.now()): Stored<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored<T>;
    if (!parsed || !fresh(parsed.savedAt, now)) {
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
        if (!v || !fresh(v.savedAt, now)) stale.push(k);
      } catch {
        stale.push(k);
      }
    }
    stale.forEach(removeDraft);
  } catch { /* ignore */ }
}

// ── IndexedDB (photo) ───────────────────────────────────────────────────────

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        try { req.result.createObjectStore(STORE); } catch { /* exists */ }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function withStore<R>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<R> | void): Promise<R | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<R | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
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
