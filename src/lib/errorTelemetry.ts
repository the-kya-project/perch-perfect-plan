// Server-side error reports → PostHog error tracking (`$exception` events).
//
// Same contract as cronTelemetry.ts, and for the same reason: on Vercel, work
// started after the response is returned is frozen and never finishes. So the
// capture is AWAITED before the caller returns its response, bounded by a 2s
// AbortController timeout, and every failure inside it is swallowed — a PostHog
// outage can never slow down, break, or change the response of a request.
//
// Dependency-free and isomorphic (fetch + Web Crypto only, no server-only
// imports), because route files that use it are also part of the client route
// tree. Nothing here runs in the browser.
//
// Privacy: the property bag passes through the analytics URL/token scrubber and
// the error-message scrubber (Postgres row text, quoted input, emails, 500-char
// cap) before it is sent. The only identity is the hashed user id; anonymous
// and sitter requests are sent without a person profile.

import { baseErrorTags, isSitterRoute, type ErrorUserRole } from "./errorTags";
import { scrubExceptionProperties, scrubErrorMessage } from "./errorScrub";
import { sanitizeAnalyticsProperties } from "./urlScrub";
import { hashUserId } from "./userHash";

// Public project key — the same client identifier analytics.ts ships in every
// page. A literal on purpose: see the note in cronTelemetry.ts.
const POSTHOG_KEY = "phc_qkMPyAbqFHDcG6FdXFBQUsiyPsbMjbCX2hNSw2bddPKh";
const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";
const CAPTURE_TIMEOUT_MS = 2000;
const ROLE_LOOKUP_TIMEOUT_MS = 800;

/** Per warm instance: at most this many reports a minute. A crash loop must not
 *  burn the monthly exception quota (or add 2s to every failing request). */
const INSTANCE_CAP_PER_MINUTE = 30;
let windowStart = 0;
let windowCount = 0;

/** Errors already reported, so the layered hooks (server-fn middleware →
 *  request middleware → server.ts) report each failure once. */
const reported = new WeakSet<object>();

// ---------------- what counts as a bug ----------------

/**
 * Failures that are part of normal operation, not bugs: router redirects and
 * not-founds, HTTP errors below 500, signed-out callers, and sitter link states
 * (expired / revoked / paused) — those are answers, not crashes. Also the
 * "View as sitter" preview refusing a write (assertNotPreview in
 * sitter.functions.ts): the guard working, not a bug.
 */
export function isExpectedServerError(error: unknown): boolean {
  if (error instanceof Response) return error.status < 500;
  if (!error || typeof error !== "object") return false;
  const e = error as Record<string, unknown>;
  if (e.isNotFound === true || e.isRedirect === true) return true;
  const status = typeof e.statusCode === "number" ? e.statusCode : typeof e.status === "number" ? e.status : null;
  if (status !== null && status < 500) return true;
  const msg = typeof e.message === "string" ? e.message : "";
  if (/^SITTER_[A-Z_]+$/.test(msg)) return true;
  if (/^Unauthorized\b/.test(msg)) return true;
  if (msg.startsWith("This is a read-only preview")) return true;
  return false;
}

// ---------------- stack → PostHog frames ----------------

type RawFrame = {
  platform: "node:javascript";
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
  in_app: boolean;
  chunk_id?: string;
};

const V8_FRAME_RE = /^\s*at (?:(.+?) \()?(.+?):(\d+):(\d+)\)?\s*$/;

function chunkIdsByFile(): Map<string, string> {
  // `posthog-cli sourcemap inject` adds a snippet to every built file that
  // records { [a stack captured inside that file]: chunkId } on globalThis.
  // Parse each recorded stack's first frame to learn which file the id belongs
  // to; frames from that file can then be symbolicated against the uploaded map.
  const out = new Map<string, string>();
  const ids = (globalThis as { _posthogChunkIds?: Record<string, string> })._posthogChunkIds;
  if (!ids) return out;
  for (const [stack, id] of Object.entries(ids)) {
    for (const line of stack.split("\n")) {
      const m = V8_FRAME_RE.exec(line);
      if (m) {
        out.set(m[2], id);
        break;
      }
    }
  }
  return out;
}

/** V8 stack → PostHog raw frames, oldest call first (PostHog's order). */
export function parseStackFrames(stack: string | undefined): RawFrame[] {
  if (!stack) return [];
  const chunks = chunkIdsByFile();
  const frames: RawFrame[] = [];
  for (const line of stack.split("\n").slice(1, 51)) {
    const m = V8_FRAME_RE.exec(line);
    if (!m) continue;
    const filename = m[2];
    const frame: RawFrame = {
      platform: "node:javascript",
      filename,
      function: m[1] ?? "<anonymous>",
      lineno: Number(m[3]),
      colno: Number(m[4]),
      in_app: !/node_modules|^node:|^internal\//.test(filename),
    };
    const chunkId = chunks.get(filename);
    if (chunkId) frame.chunk_id = chunkId;
    frames.push(frame);
  }
  return frames.reverse();
}

// ---------------- who hit it ----------------

/** The `sub` of a Supabase access token, decoded WITHOUT verification. Used only
 *  to tag an error report; it grants nothing. */
export function jwtSubject(authorization: string | null | undefined): string | null {
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const payload = token?.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

/**
 * Owner vs household for a signed-in caller: the bird in question when the call
 * names one, otherwise whether the account owns any bird. Read with the
 * caller's OWN token (RLS lets a member read their membership rows), bounded by
 * a short timeout; on any failure the tag falls back to "owner".
 */
async function lookupRole(authorization: string, userId: string, birdId?: string): Promise<ErrorUserRole> {
  const env = serverEnv();
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return "owner";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROLE_LOOKUP_TIMEOUT_MS);
  try {
    const q = new URLSearchParams({ select: "role", user_id: `eq.${userId}`, limit: "50" });
    if (birdId) q.set("bird_id", `eq.${birdId}`);
    const res = await fetch(`${url}/rest/v1/bird_members?${q}`, {
      headers: { apikey: key, Authorization: authorization },
      signal: controller.signal,
    });
    if (!res.ok) return "owner";
    const rows = (await res.json()) as Array<{ role?: string }>;
    const roles = new Set(rows.map((r) => r.role));
    return !roles.has("owner") && roles.has("household") ? "household" : "owner";
  } catch {
    return "owner";
  } finally {
    clearTimeout(timer);
  }
}

// ---------------- capture ----------------

type Env = Record<string, string | undefined>;
function serverEnv(): Env {
  return (globalThis as { process?: { env?: Env } }).process?.env ?? {};
}

/** production / preview on Vercel; development anywhere else (local dev,
 *  where nothing is sent at all). */
function serverEnvironment(): "production" | "preview" | "development" {
  const env = serverEnv();
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

/** Test hook: scripts/url-scrub.test.ts sets this to exercise the real send
 *  path (with fetch stubbed) outside Vercel. */
const FORCE_FLAG = "__KYA_FORCE_ERROR_TELEMETRY__";

export type ServerErrorContext = {
  /** Route pattern or server function, e.g. "/api/public/chart/$birdId/$month/$sig"
   *  or "serverfn:getSitterContext". Never a concrete URL. */
  route: string;
  /** The incoming Authorization header, if any. */
  authorization?: string | null;
  /** Server-function input. Only `token` (sitter call) and `birdId` are read. */
  data?: unknown;
  /** Which hook caught it. */
  mechanism: "server_fn_middleware" | "request_middleware" | "server_entry" | "server_route";
};

function underCap(): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  windowCount += 1;
  return windowCount <= INSTANCE_CAP_PER_MINUTE;
}

/**
 * Report one server error to PostHog. Awaited by the caller, never throws,
 * never takes longer than ~2.8s (role lookup + send), skips expected errors and
 * anything already reported.
 */
export async function captureServerException(thrown: unknown, ctx: ServerErrorContext): Promise<void> {
  try {
    const environment = serverEnvironment();
    if (environment === "development" && !(globalThis as Record<string, unknown>)[FORCE_FLAG]) return;
    if (isExpectedServerError(thrown)) return;
    if (thrown && typeof thrown === "object") {
      if (reported.has(thrown)) return;
      reported.add(thrown);
    }
    if (!underCap()) return;

    const error =
      thrown instanceof Error
        ? thrown
        : new Error(
            thrown && typeof thrown === "object" && typeof (thrown as { message?: unknown }).message === "string"
              ? (thrown as { message: string }).message
              : String(thrown),
          );

    const data = (ctx.data && typeof ctx.data === "object" ? ctx.data : {}) as Record<string, unknown>;
    const isSitter = typeof data.token === "string" || isSitterRoute(ctx.route);
    const userId = isSitter ? null : jwtSubject(ctx.authorization);
    let role: ErrorUserRole = "anonymous";
    if (isSitter) role = "sitter";
    else if (userId && ctx.authorization) {
      role = await lookupRole(ctx.authorization, userId, typeof data.birdId === "string" ? data.birdId : undefined);
    } else if (ctx.route.startsWith("/api/public/hooks/")) role = "system";

    const distinctId = (await hashUserId(userId)) ?? "server";
    const properties: Record<string, unknown> = {
      $exception_list: [
        {
          type: error.name || "Error",
          value: scrubErrorMessage(error.message ?? ""),
          mechanism: { type: "generic", handled: false, synthetic: false },
          stacktrace: { type: "raw", frames: parseStackFrames(error.stack) },
        },
      ],
      $exception_level: "error",
      mechanism: ctx.mechanism,
      ...baseErrorTags(environment, "server", "server", ctx.route, role),
      // No person profile for anonymous / sitter / cron reports.
      ...(distinctId === "server" ? { $process_person_profile: false } : {}),
    };
    const safe = scrubExceptionProperties(sanitizeAnalyticsProperties(properties));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
    try {
      await fetch(POSTHOG_CAPTURE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: POSTHOG_KEY,
          event: "$exception",
          distinct_id: distinctId,
          properties: safe,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // A PostHog outage/timeout must never affect the request. Log only.
    console.error("[error-telemetry] capture failed:", err instanceof Error ? err.message : String(err));
  }
}

// Typed as the handler itself so the route's own param/request typing flows
// through unchanged.
type RouteHandler = (ctx: any) => Response | Promise<Response>;

/**
 * Wrap a server-route handler so an unexpected throw is reported (awaited)
 * before it propagates. Behaviour and response are otherwise unchanged.
 */
export function withErrorTelemetry<H extends RouteHandler>(route: string, handler: H): H {
  const wrapped = async (ctx: { request?: Request }) => {
    try {
      return await handler(ctx);
    } catch (err) {
      await captureServerException(err, {
        route,
        authorization: ctx?.request?.headers.get("authorization") ?? null,
        mechanism: "server_route",
      });
      throw err;
    }
  };
  return wrapped as unknown as H;
}
