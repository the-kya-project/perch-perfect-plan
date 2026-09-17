/**
 * Turn a thrown value into something a person can actually read.
 *
 * We were passing Supabase/Postgres errors straight to toast.error(), so a
 * failure surfaced verbatim — e.g.
 *
 *   insert or update on table "birds" violates foreign key constraint "birds_owner_id_fkey"
 *
 * which means nothing to an owner, and leaks table and constraint names to
 * anyone on a public surface (the handoff and sitter routes are unauthenticated).
 *
 * This is deliberately conservative: plenty of errors in this app ARE written
 * for people — Supabase auth copy ("Invalid login credentials"), our own
 * `throw new Error("Pick a start and end date.")`, Postgres RAISE messages from
 * triggers. Those pass through untouched. Only recognisably raw database output
 * is swapped for the caller's fallback, and the original is logged so it is
 * still there when debugging.
 */

/** SQLSTATEs worth explaining specifically rather than generically. */
const SQLSTATE_COPY: Record<string, string> = {
  "23503": "That's still connected to something else, so it can't be changed right now.",
  "23505": "That already exists.",
  "23502": "Something required was missing.",
  "23514": "Some of those details aren't valid.",
  "42501": "You don't have permission to do that.",
  "22P02": "Some of those details aren't in the right format.",
};

/**
 * Shapes that only ever come from the database driver, never from copy someone
 * wrote. Matching any of these means the text is not fit to show.
 */
const RAW_DATABASE_TEXT = new RegExp(
  [
    "violates .*constraint",
    "duplicate key value",
    "permission denied for",
    'relation "[^"]*" does not exist',
    'column "[^"]*" does not exist',
    "null value in column",
    "invalid input syntax",
    "syntax error at or near",
    "insert or update on table",
    "update or delete on table",
    "PGRST\\d+",
    "JWSError|JWTExpired|JWSInvalidSignature",
  ].join("|"),
  "i",
);

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

/** Keep the real error reachable in the console without showing it to anyone. */
function logRaw(raw: string, code: string) {
  try {
    console.error(`[suppressed error]${code ? ` (${code})` : ""} ${raw}`);
  } catch {
    /* never let logging break a handler */
  }
}

/**
 * @param err      the thrown value — a PostgrestError, an Error, or anything
 * @param fallback what to show when the error has nothing presentable
 */
export function friendlyError(err: unknown, fallback: string = DEFAULT_FALLBACK): string {
  const e = err as { message?: unknown; code?: unknown } | null | undefined;
  const raw = typeof e?.message === "string" ? e.message.trim() : "";
  const code = typeof e?.code === "string" ? e.code : "";

  const bySqlstate = code ? SQLSTATE_COPY[code] : undefined;
  if (bySqlstate) {
    logRaw(raw, code);
    return bySqlstate;
  }

  if (!raw) return fallback;

  if (RAW_DATABASE_TEXT.test(raw)) {
    logRaw(raw, code);
    return fallback;
  }

  return raw;
}
