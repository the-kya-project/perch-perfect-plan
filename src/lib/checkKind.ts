// Which kind of health check a daily_logs row is: the quick daily check or the
// full health check. Stored in daily_logs.kind from 20261021200000; rows from
// before it (and from older builds that don't send it) fall back to a guess.
// No client imports, so server functions and tests can use it too.
import { isMissingColumn } from "./missingColumn";

export type CheckKind = "daily" | "full";

/** photo_logs.notes on a photo the full health check attaches. */
export const FULL_CHECK_PHOTO_NOTE = "Attached to health check";

type KindRow = { kind?: string | null; source?: string | null; item_notes?: unknown };

// The guess, for rows with no stored kind. The full health check and the daily
// check write the same row shape (buildDailyLogRow); only the full check can
// store per-answer notes (item_notes) or attach a photo, so either marks a full
// check. A sitter's check is always the daily check. Anything else reads as a
// daily check, the more common kind: an all-normal full check with no notes or
// photo can't be told apart. 20261021200000 backfills with this same rule.
export function isFullCheck(row: KindRow, photoNotes: (string | null)[]): boolean {
  if (row.source === "sitter") return false;
  const notes = row.item_notes;
  if (notes && typeof notes === "object" && !Array.isArray(notes) && Object.values(notes as Record<string, unknown>).some((v) => typeof v === "string" && v.trim())) return true;
  return photoNotes.some((n) => n === FULL_CHECK_PHOTO_NOTE);
}

/** The stored kind, else the guess. `photoNotes` are the notes of the photos
 *  attached to the row, when the caller has them. */
export function checkKindOf(row: KindRow, photoNotes: (string | null)[] = []): CheckKind {
  if (row.kind === "daily" || row.kind === "full") return row.kind;
  return isFullCheck(row, photoNotes) ? "full" : "daily";
}

/** Insert a daily_logs row, retrying without `kind` while the column doesn't
 *  exist yet (the app can go live minutes before 20261021200000 is applied;
 *  the migration's backfill then classifies those rows). */
export async function insertWithKind<R extends { error: { code?: string; message?: string } | null }>(
  row: Record<string, unknown>,
  run: (row: Record<string, unknown>) => PromiseLike<R>,
): Promise<R> {
  const res = await run(row);
  if (!("kind" in row) || !isMissingColumn(res.error, "kind")) return res;
  const { kind: _kind, ...rest } = row;
  return run(rest);
}
