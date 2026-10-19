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
 *
 * LOCALIZATION: everything this returns is shown to a person, so it follows the
 * UI language. The SQLSTATE copy and the default fallback are keyed here, and a
 * raw message that is one of our own known server/client English errors is
 * translated by translateServerError (src/lib/i18n/serverErrors.ts). A caller's
 * own `fallback` is passed through as given — key it at the call site. English
 * output is byte-identical. Pass `t` from useTranslation() on a surface with
 * its own i18n instance (the sitter subtree); owner code can omit it.
 */
import i18next, { type TFunction } from "i18next";
import { translateServerError } from "@/lib/i18n/serverErrors";

/** SQLSTATEs worth explaining specifically rather than generically. */
function sqlstateCopy(code: string, t: TFunction): string | undefined {
  switch (code) {
    case "23503":
      return t("dbError.stillConnected", "That's still connected to something else, so it can't be changed right now.");
    case "23505":
      return t("dbError.alreadyExists", "That already exists.");
    case "23502":
      return t("dbError.missingRequired", "Something required was missing.");
    case "23514":
      return t("dbError.notValid", "Some of those details aren't valid.");
    case "42501":
      return t("dbError.noPermission", "You don't have permission to do that.");
    case "22P02":
      return t("dbError.wrongFormat", "Some of those details aren't in the right format.");
  }
  return undefined;
}

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

const defaultFallback = (t: TFunction) => t("dbError.somethingWentWrong", "Something went wrong. Please try again.");

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
 * @param tr       optional translator (a scoped instance's t); defaults to the global one
 */
export function friendlyError(err: unknown, fallback?: string, tr?: TFunction): string {
  const t: TFunction = tr ?? i18next.t.bind(i18next);
  const fb = fallback ?? defaultFallback(t);
  const e = err as { message?: unknown; code?: unknown } | null | undefined;
  const raw = typeof e?.message === "string" ? e.message.trim() : "";
  const code = typeof e?.code === "string" ? e.code : "";

  const bySqlstate = code ? sqlstateCopy(code, t) : undefined;
  if (bySqlstate) {
    logRaw(raw, code);
    return bySqlstate;
  }

  if (!raw) return fb;

  if (RAW_DATABASE_TEXT.test(raw)) {
    logRaw(raw, code);
    return fb;
  }

  return translateServerError(raw, t) ?? raw;
}
