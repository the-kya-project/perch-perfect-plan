// Failed saves → one anonymous row in public.save_errors, for alerting.
//
// Why: on Oct 26, 2026 owners couldn't create sits for six days. The app said
// "You don't have permission to do that." (friendlyError) and nothing else
// heard about it. So friendlyError, and the React Query mutation cache for
// mutations that write their own copy, hand every error here. Only errors that
// came from the server are kept (a database refusal, a server error, a network
// failure); a message our own code wrote for a person ("Pick a start and end
// date.") is a validation answer, not a failure, and is ignored.
//
// What is kept is a shape, never content: a category, the SQLSTATE, the table
// or function the database named, and (added by the recorder) route pattern,
// platform, version and a hashed person id. Never the message itself, which
// can quote row data.
//
// Pure and dependency-free, so scripts/save-errors.test.ts can run it. The
// browser recorder (saveErrorReporting.ts) is plugged in at boot with
// setSaveErrorRecorder; until then, and on the server, noting is a no-op.

export type SaveErrorCategory =
  | "permission" // 42501: a row-level security policy or grant refused it
  | "conflict" // 23505: already exists
  | "still_linked" // 23503: a foreign key
  | "missing_required" // 23502
  | "invalid" // 23514, 22xxx
  | "schema" // a table, column or function the app expects isn't there
  | "auth" // the session expired or the token was refused
  | "rejected" // P0001: one of our own triggers or functions said no
  | "database" // any other SQLSTATE
  | "server" // a 5xx with no database detail
  | "network" // the request never got an answer
  | "config"; // the server is missing a setting (a Brevo key or list id)

export type SaveErrorOperation = "write" | "delete" | "rpc" | "storage" | "server_fn" | "brevo_list";

export type SaveErrorShape = {
  category: SaveErrorCategory;
  sqlstate: string | null;
  target: string | null;
  operation: SaveErrorOperation | null;
};

/** Categories that only ever reach the daily summary, never an urgent email:
 *  phones lose signal and sessions expire every day. */
export const DAILY_ONLY_CATEGORIES: ReadonlySet<SaveErrorCategory> = new Set(["network", "auth"]);

const SQLSTATE = /^[0-9A-Z]{5}$/;
const PGRST = /^PGRST\d{3}$/;

/** Raw database text → the SQLSTATE it stands for. Server functions rethrow
 *  database errors as `new Error(error.message)` (sitter.functions.ts), which
 *  drops the code, so the message is all the sitter pages get. */
const MESSAGE_SQLSTATE: Array<[RegExp, string]> = [
  [/row-level security|permission denied for/i, "42501"],
  [/violates foreign key constraint/i, "23503"],
  [/duplicate key value/i, "23505"],
  [/null value in column/i, "23502"],
  [/violates check constraint/i, "23514"],
  [/invalid input syntax/i, "22P02"],
  [/relation "[^"]*" does not exist/i, "42P01"],
  [/column "[^"]*" does not exist/i, "42703"],
  [/function .* does not exist/i, "42883"],
];

const NETWORK = /failed to fetch|load failed|networkerror|network request failed|fetch failed/i;
const AUTH_TEXT = /JWSError|JWTExpired|JWSInvalidSignature|jwt expired|invalid jwt/i;
const SCHEMA_CACHE = /could not find the .* in the schema cache/i;

function categoryFor(sqlstate: string): SaveErrorCategory {
  if (sqlstate === "42501") return "permission";
  if (sqlstate === "23505") return "conflict";
  if (sqlstate === "23503") return "still_linked";
  if (sqlstate === "23502") return "missing_required";
  if (sqlstate === "23514" || sqlstate.startsWith("22")) return "invalid";
  if (sqlstate === "P0001") return "rejected";
  if (["42P01", "42703", "42883"].includes(sqlstate)) return "schema";
  if (sqlstate === "PGRST301" || sqlstate === "PGRST303") return "auth";
  if (/^PGRST2\d\d$/.test(sqlstate)) return "schema";
  return "database";
}

/** The table or function the database named, and what was being done to it. */
function targetFrom(message: string): { target: string | null; operation: SaveErrorOperation | null } {
  const ident = (s: string | undefined) => {
    const v = (s ?? "").split(".").pop()?.toLowerCase() ?? "";
    return /^[a-z_][a-z0-9_]{0,62}$/.test(v) ? v : null;
  };
  let m = /update or delete on table "([^"]+)"/i.exec(message);
  if (m) return { target: ident(m[1]), operation: "delete" };
  m = /permission denied for function ([\w.]+)/i.exec(message) ?? /function ([\w.]+)\(.*\) does not exist/i.exec(message);
  if (m) return { target: ident(m[1]), operation: "rpc" };
  m = /permission denied for (?:table|relation|sequence) ([\w.]+)/i.exec(message);
  if (m) return { target: ident(m[1]), operation: "write" };
  m = /(?:table|relation) "([^"]+)"/i.exec(message);
  if (m) return { target: ident(m[1]), operation: /new row|insert or update|null value|violates/i.test(message) ? "write" : null };
  return { target: null, operation: null };
}

/**
 * The shape of a failed save, or null when the error isn't one to record (a
 * message written for a person, a cancelled request, the read-only sitter
 * preview refusing a write).
 */
export function classifySaveError(err: unknown): SaveErrorShape | null {
  if (!err || typeof err !== "object") return null;
  const e = err as { message?: unknown; code?: unknown; name?: unknown; status?: unknown; statusCode?: unknown };
  const message = typeof e.message === "string" ? e.message : "";
  const code = typeof e.code === "string" ? e.code.trim() : "";
  const name = typeof e.name === "string" ? e.name : "";
  const statusRaw = e.status ?? e.statusCode;
  const status = typeof statusRaw === "number" ? statusRaw : Number(statusRaw) || 0;

  if (name === "AbortError") return null;
  // "View as sitter" refusing a write is the guard working (errorReporting).
  if (message.startsWith("This is a read-only preview")) return null;

  const storage = /^Storage/.test(name);
  let sqlstate = SQLSTATE.test(code) || PGRST.test(code) ? code : null;
  if (!sqlstate) sqlstate = MESSAGE_SQLSTATE.find(([re]) => re.test(message))?.[1] ?? null;

  let category: SaveErrorCategory | null = sqlstate ? categoryFor(sqlstate) : null;
  if (!category && AUTH_TEXT.test(message)) category = "auth";
  if (!category && SCHEMA_CACHE.test(message)) category = "schema";
  if (!category && NETWORK.test(message)) category = "network";
  if (!category && status >= 500) category = "server";
  if (!category) return null;

  const t = targetFrom(message);
  return {
    category,
    sqlstate,
    target: t.target,
    operation: storage ? "storage" : t.operation,
  };
}

/** One error type, for counting and for "at most one urgent email per type
 *  per day": category, SQLSTATE, table and operation. Route and platform are
 *  reported but don't split a type. */
export function saveErrorSignature(s: Pick<SaveErrorShape, "category" | "sqlstate" | "target" | "operation">): string {
  return [s.category, s.sqlstate ?? "-", s.target ?? "-", s.operation ?? "-"].join("|");
}

type Recorder = (shape: SaveErrorShape) => void;
let recorder: Recorder | null = null;
// friendlyError and the mutation cache both see a mutation's error; one row.
const seen = new WeakSet<object>();

/** Plug in the browser recorder (saveErrorReporting.ts). Null unplugs it. */
export function setSaveErrorRecorder(fn: Recorder | null) {
  recorder = fn;
}

/** Record a failed save, if it is one. Never throws, never blocks. */
export function noteSaveError(err: unknown): void {
  try {
    if (!recorder || !err || typeof err !== "object") return;
    if (seen.has(err)) return;
    seen.add(err);
    const shape = classifySaveError(err);
    if (shape) recorder(shape);
  } catch {
    /* recording must never break the screen that failed */
  }
}

/** A clip or photo that couldn't be shown (the player failed, signing failed,
 *  Cloudflare couldn't process it). Recorded like a failed save, so the alerts
 *  reach Brittany; never content, only "server" and what kind of media. */
export function noteMediaError(target: "journey_clip"): void {
  try {
    recorder?.({ category: "server", sqlstate: null, target, operation: "server_fn" });
  } catch {
    /* recording must never break the screen that failed */
  }
}
