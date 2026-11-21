// The browser half of save-error alerting: turns a failed save's shape
// (saveErrors.ts) into one row in public.save_errors.
//
// Tags come from errorReporting (route PATTERN, platform, role), the build
// from errorTags, and the environment from deployEnv. The person is counted,
// not named: a signed-in person's hash is filled in by the database itself
// (sha256 of their id; the client can't set it), and anyone on a sitter,
// invite or handoff link sends `anon:` + a hash of the link token, so one link
// counts as one person. Anyone else gets a random id kept in this browser.
//
// Plain insert, no .select(): the table has no read policy for app users, so
// asking for the row back would fail the same way the sits insert did.
// Never throws, never awaited by the screen, and a failure to record is
// dropped rather than reported (it would only loop).
import { supabase } from "@/integrations/supabase/client";
import { DEPLOY_ENV } from "./deployEnv";
import { currentErrorContext } from "./errorReporting";
import { WEB_BUILD } from "./errorTags";
import { setSaveErrorRecorder, saveErrorSignature, type SaveErrorShape } from "./saveErrors";
import { APP_VERSION } from "./version";

/** Rows per page session; past this a broken screen is already well counted. */
const SESSION_CAP = 20;
/** The same error type on the same route within this window is one row. */
const DUPLICATE_WINDOW_MS = 30_000;
const ANON_ID_KEY = "kya_anon_error_id";
/** What the table accepts as a route (a pattern like "/sitter/$token/scan"). */
const ROUTE_SHAPE = /^(\/[A-Za-z0-9_$.-]*)+$/;

let sent = 0;
const recent = new Map<string, number>();
let browserAnonId: string | null = null;

async function sha256Hex(value: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const buf = await subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

function randomHex(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function anonBrowserId(): string {
  if (browserAnonId) return browserAnonId;
  try {
    const stored = localStorage.getItem(ANON_ID_KEY);
    if (stored && /^[0-9a-f]{32}$/.test(stored)) return (browserAnonId = stored);
    browserAnonId = randomHex();
    localStorage.setItem(ANON_ID_KEY, browserAnonId);
  } catch {
    browserAnonId ??= randomHex();
  }
  return browserAnonId;
}

async function record(shape: SaveErrorShape) {
  if (typeof window === "undefined" || sent >= SESSION_CAP) return;
  const ctx = currentErrorContext();
  const key = `${ctx.route}|${saveErrorSignature(shape)}`;
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DUPLICATE_WINDOW_MS) return;
  recent.set(key, now);
  sent += 1;

  // A link token is the sitter's credential: only its hash leaves the page.
  const linkHash = ctx.token ? await sha256Hex(`link:${ctx.token}`) : null;
  const userHash = `anon:${linkHash ? linkHash.slice(0, 32) : anonBrowserId()}`;

  // Typed loosely: the table postdates the generated types.
  const { error } = await (supabase as unknown as { from: (t: string) => { insert: (row: object) => Promise<{ error: unknown }> } })
    .from("save_errors")
    .insert({
      category: shape.category,
      sqlstate: shape.sqlstate,
      target: shape.target,
      operation: shape.operation,
      route: ROUTE_SHAPE.test(ctx.route) && ctx.route.length <= 120 ? ctx.route : "unknown",
      platform: ctx.platform,
      app_version: APP_VERSION,
      web_build: WEB_BUILD,
      user_role: ctx.role === "system" ? null : ctx.role,
      environment: DEPLOY_ENV,
      // Replaced by the database for a signed-in person.
      user_hash: userHash,
    });
  if (error) console.warn("[save-errors] not recorded");
}

let installed = false;

/** Start recording failed saves. Idempotent; call once at boot, after
 *  registerErrorReportingContext. */
export function installSaveErrorRecorder() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  setSaveErrorRecorder((shape) => {
    void record(shape).catch(() => console.warn("[save-errors] not recorded"));
  });
}
