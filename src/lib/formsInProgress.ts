/**
 * Which forms on this page hold input the owner hasn't saved yet.
 *
 * The update logic (sw-register.ts) reads this to decide whether a new version
 * can be applied quietly or has to wait behind the "A new version is ready"
 * banner, and calls flushAllDrafts() before the banner's Update reloads.
 *
 * A form registers once while mounted and answers `active()` on demand, so a
 * debounced autosave can report "pending" from a ref without re-rendering.
 * Call notifyFormsChanged() when the answer may have changed so the banner
 * re-checks.
 */
import { useEffect, useRef } from "react";

export type FormEntry = {
  /** True while the form holds input that isn't saved anywhere yet. */
  active: () => boolean;
  /** Write the input somewhere a reload can't reach (a local draft, the
   *  server). Omitted = nothing can keep it, so Update waits for the owner. */
  flush?: () => void | Promise<void>;
};

const entries = new Set<FormEntry>();
const listeners = new Set<() => void>();

export function registerForm(entry: FormEntry): () => void {
  entries.add(entry);
  notifyFormsChanged();
  return () => {
    entries.delete(entry);
    notifyFormsChanged();
  };
}

export function notifyFormsChanged() {
  listeners.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
}

export function subscribeForms(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function safeActive(e: FormEntry): boolean {
  try { return e.active(); } catch { return false; }
}

/** Is anything on this page mid-entry? */
export function formInProgress(): boolean {
  for (const e of entries) if (safeActive(e)) return true;
  return false;
}

/** Is anything mid-entry that a reload would lose for good (no flush)? */
export function unsavedWorkWithoutDraft(): boolean {
  for (const e of entries) if (safeActive(e) && !e.flush) return true;
  return false;
}

/** Save every active form's draft before a reload. Best-effort and bounded:
 *  a stuck save never holds the reload past `timeoutMs`. */
export async function flushAllDrafts(timeoutMs = 2000): Promise<void> {
  const jobs: Promise<unknown>[] = [];
  for (const e of entries) {
    if (!e.flush || !safeActive(e)) continue;
    try { jobs.push(Promise.resolve(e.flush()).catch(() => {})); } catch { /* ignore */ }
  }
  if (!jobs.length) return;
  await Promise.race([
    Promise.all(jobs),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/** Register a form for as long as the component is mounted. `active` and
 *  `flush` are read through refs, so they can close over fresh state. */
export function useFormInProgress(active: boolean | (() => boolean), flush?: () => void | Promise<void>) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const flushRef = useRef(flush);
  flushRef.current = flush;
  const hasFlush = !!flush;
  useEffect(() => {
    const entry: FormEntry = {
      active: () => {
        const a = activeRef.current;
        return typeof a === "function" ? a() : a;
      },
      flush: hasFlush ? () => flushRef.current?.() : undefined,
    };
    return registerForm(entry);
  }, [hasFlush]);
  // A plain boolean changing is the common case: tell the banner.
  const value = typeof active === "function" ? null : active;
  useEffect(() => { if (value !== null) notifyFormsChanged(); }, [value]);
}
