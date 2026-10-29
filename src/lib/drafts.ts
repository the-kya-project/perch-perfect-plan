/**
 * Local drafts for forms a reload must not wipe (the full health check, the
 * weight entry). Saved as the owner types, restored on reopen with a "We saved
 * your unfinished …" line, never submitted on their own.
 *
 * - Scoped to the signed-in account AND the bird, so a household member on the
 *   same device never opens someone else's draft.
 * - Text in localStorage; a photo in IndexedDB (data URLs are too big for
 *   localStorage's few-MB quota).
 * - Every storage call is wrapped: private mode, a full quota or blocked site
 *   data just means no draft, and the form works exactly as before.
 * - A draft older than DRAFT_TTL_MS is dropped unread, so yesterday's weight is
 *   never offered as today's.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyFormsChanged, useFormInProgress } from "./formsInProgress";
import { deletePhoto, draftKey, loadPhoto, sitDraftKey, readDraft, removeDraft, savePhoto, sweepExpiredDrafts, writeDraftText } from "./draftStore";

export { DRAFT_TTL_MS } from "./draftStore";

// ── The hook ────────────────────────────────────────────────────────────────

/** The signed-in user's id from the local session (no network), or null. */
function useLocalUserId(): string | null | undefined {
  const [id, setId] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    supabase.auth.getSession()
      .then(({ data }) => { if (live) setId(data.session?.user?.id ?? null); })
      .catch(() => { if (live) setId(null); });
    return () => { live = false; };
  }, []);
  return id;
}

/** The saved draft of `kind` for this account and bird, if there is one, for a
 *  screen deciding whether to reopen its form. */
export async function peekDraft<T>(birdId: string, kind: string): Promise<{ savedAt: number; data: T } | null> {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return null;
    return readDraft<T>(draftKey({ userId, birdId, kind }));
  } catch {
    return null;
  }
}

export type Restored<T> = { data: T; photo: string | null; savedAt: number };

/**
 * Keep a form's input in a local draft.
 *
 * - On mount, a saved draft for this account (or sit) + bird + kind is handed to
 *   `onRestore` (once), and `restoredAt` is set so the form can show the
 *   "We saved your unfinished …" line with Continue / Discard.
 * - After that, `data` (and `photo`) are saved 500 ms after the last change,
 *   and immediately by flush() (the update banner calls it before reloading).
 * - `empty` = nothing worth keeping: the draft is removed instead.
 * - clear() after a successful save; discard() when the owner says so.
 *
 * `sit` scopes the draft to a sit link instead of the signed-in account (a
 * sitter has none) and ends it when the sit ends, if that's sooner than 24
 * hours. `enabled: false` turns all of it off.
 */
export function useFormDraft<T>({ kind, birdId, enabled = true, sit, data, photo = null, empty, onRestore }: {
  kind: string;
  birdId: string;
  enabled?: boolean;
  /** Sitter: the sit link's token and when the sit ends (epoch ms, or null). */
  sit?: { token: string; endsAt: number | null };
  data: T;
  photo?: string | null;
  empty: boolean;
  /** Put the draft back in the fields. Return false to decline it (it
   *  belongs to something else on this screen); it then stays on disk. */
  onRestore: (r: Restored<T>) => boolean | void;
}) {
  const userId = useLocalUserId();
  const sitToken = sit?.token ?? null;
  const sitEndsAt = sit?.endsAt ?? null;
  const key = !enabled
    ? null
    : sitToken
      ? sitDraftKey({ token: sitToken, birdId, kind })
      : userId ? draftKey({ userId, birdId, kind }) : null;
  const endsAtRef = useRef(sitEndsAt);
  endsAtRef.current = sitEndsAt;
  // Writes wait until the restore check has run: otherwise the form's empty
  // first render would overwrite the very draft we're about to offer.
  const [ready, setReady] = useState(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;
  // What's on disk, so an unchanged form doesn't rewrite (and so re-date) it.
  const writtenRef = useRef<string | null>(null);
  const photoWrittenRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bumped by clear(): a photo write still in flight when the entry saves
  // must not leave the photo behind on the device.
  const genRef = useRef(0);
  const latest = useRef({ data, photo, empty });
  latest.current = { data, photo, empty };

  useEffect(() => {
    if (!key) return;
    let live = true;
    setReady(false);
    sweepExpiredDrafts();
    // The sit has ended (it can end sooner than the stored date, if the owner
    // shortened it): drop the draft and show nothing.
    const ends = endsAtRef.current;
    if (typeof ends === "number" && Date.now() >= ends) { removeDraft(key); setReady(true); return; }
    const saved = readDraft<T>(key);
    if (!saved) { setReady(true); return; }
    (async () => {
      const ph = saved.hasPhoto ? await loadPhoto(key) : null;
      if (!live) return;
      if (onRestoreRef.current({ data: saved.data, photo: ph, savedAt: saved.savedAt }) !== false) {
        writtenRef.current = JSON.stringify(saved.data);
        photoWrittenRef.current = ph;
        setRestoredAt(saved.savedAt);
      }
      setReady(true);
    })();
    return () => { live = false; };
  }, [key]);

  const writeNow = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (!key) return;
    const { data: d, photo: p, empty: e } = latest.current;
    if (e) {
      if (writtenRef.current !== null || photoWrittenRef.current !== null) removeDraft(key);
      writtenRef.current = null;
      photoWrittenRef.current = null;
      return;
    }
    const json = JSON.stringify(d);
    if (json !== writtenRef.current || !!p !== !!photoWrittenRef.current) {
      if (writeDraftText(key, { savedAt: Date.now(), data: d, hasPhoto: !!p, expiresAt: endsAtRef.current })) writtenRef.current = json;
    }
    if (p !== photoWrittenRef.current) {
      const gen = genRef.current;
      if (p) {
        const ok = await savePhoto(key, p);
        if (gen !== genRef.current) { void deletePhoto(key); return; }
        if (ok) photoWrittenRef.current = p;
      } else {
        await deletePhoto(key);
        photoWrittenRef.current = null;
      }
    }
  }, [key]);

  const json = JSON.stringify(data);
  useEffect(() => {
    if (!key || !ready) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void writeNow(); }, 500);
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [key, ready, json, photo, empty, writeNow]);

  // Leaving the screen with a save still queued: write it now.
  useEffect(() => () => { if (timerRef.current) void writeNow(); }, [writeNow]);

  const clear = useCallback(() => {
    genRef.current += 1;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (key) removeDraft(key);
    writtenRef.current = null;
    photoWrittenRef.current = null;
    setRestoredAt(null);
    notifyFormsChanged();
  }, [key]);

  // In progress = there's input; the draft is the flush, so the update banner
  // can save it and reload.
  useFormInProgress(!empty, key ? writeNow : undefined);

  return {
    /** When the restored draft was last saved, until dismissed or cleared. */
    restoredAt,
    /** Hide the restored line and keep going with the draft. */
    dismiss: useCallback(() => setRestoredAt(null), []),
    /** Remove the draft (after a successful save, or Discard / Leave). */
    clear,
    flush: writeNow,
  };
}
