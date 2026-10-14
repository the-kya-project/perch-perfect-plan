// Browser error reporting → PostHog error tracking.
//
// Deliberately NOT the SDK's own exception autocapture (analytics.ts sets
// capture_exceptions: false): that lazy-loads an extra script on every page,
// sitter token pages included. Instead our own `error` / `unhandledrejection`
// listeners and the React error screens call reportError(), which hands the
// error to the PostHog library the page has already loaded.
//
// Privacy: the event passes through the same before_send scrubbing as every
// analytics event (token paths, auth material, JWTs) plus scrubExceptionProperties
// (Postgres row text, quoted input, emails, 500-char cap). The only identity is
// the hashed user id PostHog already has from identify(). Nothing here reads
// bird, care-plan or health data — the tags are build, platform, route PATTERN
// and role.

import type { QueryClient } from "@tanstack/react-query";
import type { AnyRouter } from "@tanstack/react-router";
import { captureException } from "./analytics";
import { baseErrorTags, isSitterRoute, type ErrorPlatform, type ErrorUserRole } from "./errorTags";
import { nativePlatform } from "./nativeApp";
import { isStaleChunkError, staleChunkRecoveryExhausted } from "./sw-register";
import { supabase } from "@/integrations/supabase/client";

/** Reports per browser session, after which we stop: a render loop must not
 *  burn the monthly exception quota. */
export const SESSION_REPORT_CAP = 20;
/** The same error on the same route within this window is reported once. */
const DUPLICATE_WINDOW_MS = 10_000;
const CAP_KEY = "kya_error_reports";

let router: AnyRouter | null = null;
let queryClient: QueryClient | null = null;
let accountRole: ErrorUserRole = "anonymous";
let memoryCount = 0;
const recent = new Map<string, number>();

/** Called once from the root component so reports can read the current route
 *  and the cached per-bird role. */
export function registerErrorReportingContext(ctx: { router: AnyRouter; queryClient: QueryClient }) {
  router = ctx.router;
  queryClient = ctx.queryClient;
}

/**
 * Account-level role for pages that aren't about one bird: "owner" if the
 * account owns any bird (or none yet — a new account is an owner-to-be),
 * "household" if it only has household access. Refreshed on sign-in.
 */
export async function primeAccountRole(userId: string | null) {
  if (!userId) {
    accountRole = "anonymous";
    return;
  }
  accountRole = "owner";
  try {
    const { data } = await supabase.from("bird_members").select("role").eq("user_id", userId).limit(50);
    const roles = new Set((data ?? []).map((r: { role: string }) => r.role));
    if (!roles.has("owner") && roles.has("household")) accountRole = "household";
  } catch {
    /* keep the default — a tag is not worth an error of its own */
  }
}

function currentRoute(): { route: string; birdId?: string } {
  try {
    const matches = router?.state.matches ?? [];
    const leaf = matches[matches.length - 1];
    if (leaf) {
      // routeId is the file-route pattern, e.g. "/_authenticated/birds/$birdId/weight".
      const route = String(leaf.routeId).replace(/\/_[^/]+/g, "") || "/";
      const birdId = (leaf.params as Record<string, string> | undefined)?.birdId;
      return { route, birdId };
    }
  } catch {
    /* fall through */
  }
  return { route: "unknown" };
}

function currentRole(route: string, birdId?: string): ErrorUserRole {
  if (isSitterRoute(route) || (typeof window !== "undefined" && isSitterRoute(window.location.pathname))) {
    return "sitter";
  }
  if (accountRole === "anonymous") return "anonymous";
  if (birdId && queryClient) {
    // Same cache key as useBirdRole — read only, never fetch from here.
    const birdRole = queryClient.getQueryData<"owner" | "household" | null>(["bird-role", birdId]);
    if (birdRole === "owner" || birdRole === "household") return birdRole;
  }
  return accountRole;
}

function environment(): "production" | "preview" {
  // The native shells load the production site, so they report as production.
  return window.location.hostname === "app.thekyaproject.com" ? "production" : "preview";
}

function platform(): ErrorPlatform {
  const p = nativePlatform();
  return p === "ios" || p === "android" ? p : "web";
}

function readCount(): number {
  try {
    return Number(sessionStorage.getItem(CAP_KEY) ?? "0") || 0;
  } catch {
    return memoryCount;
  }
}

function bumpCount() {
  memoryCount += 1;
  try {
    sessionStorage.setItem(CAP_KEY, String(readCount() + 1));
  } catch {
    /* memoryCount carries it */
  }
}

/** Turn whatever was thrown into an Error, keeping only the message — never
 *  the extra fields some libraries attach (Supabase errors carry `details` and
 *  `hint`, which can quote row data). */
export function toError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown;
  if (thrown && typeof thrown === "object" && typeof (thrown as { message?: unknown }).message === "string") {
    const e = new Error((thrown as { message: string }).message);
    const name = (thrown as { name?: unknown }).name;
    if (typeof name === "string" && name) e.name = name;
    return e;
  }
  return new Error(typeof thrown === "string" ? thrown : "Non-error value thrown");
}

/** Noise we never report: not our bugs, or already handled elsewhere. */
export function shouldIgnore(error: Error): boolean {
  const msg = error.message ?? "";
  // A stale-build chunk 404 self-heals by reloading (sw-register). Only once
  // that recovery is exhausted is it a real failure worth hearing about.
  if (isStaleChunkError(error) && !staleChunkRecoveryExhausted()) return true;
  if (error.name === "AbortError") return true; // navigation cancelled a fetch
  if (/ResizeObserver loop/i.test(msg)) return true; // benign browser warning
  // Cross-origin script errors carry no information at all.
  if (/^Script error\.?$/i.test(msg) && !error.stack) return true;
  // Errors raised entirely inside browser extensions.
  const stack = error.stack ?? "";
  if (stack && /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack) && !/thekyaproject\.com|\/assets\//.test(stack)) {
    return true;
  }
  // Offline: every request fails, none of it is a bug.
  if (typeof navigator !== "undefined" && navigator.onLine === false && /fetch|network|load failed/i.test(msg)) {
    return true;
  }
  return false;
}

export type ReportOptions = {
  /** How it was caught: listener, React boundary, or a deliberate report. */
  mechanism: "onerror" | "onunhandledrejection" | "react_error_boundary" | "manual";
  /** Which boundary, for the boundary mechanism. */
  boundary?: string;
};

/** Report one error. Never throws. Returns true if it was sent. */
export function reportError(thrown: unknown, opts: ReportOptions): boolean {
  try {
    if (typeof window === "undefined") return false;
    const error = toError(thrown);
    if (shouldIgnore(error)) return false;
    if (readCount() >= SESSION_REPORT_CAP) return false;

    const { route, birdId } = currentRoute();
    const key = `${route}|${error.name}|${error.message}`;
    const now = Date.now();
    const last = recent.get(key);
    if (last && now - last < DUPLICATE_WINDOW_MS) return false;
    recent.set(key, now);

    bumpCount();
    captureException(error, {
      ...baseErrorTags(environment(), "client", platform(), route, currentRole(route, birdId)),
      mechanism: opts.mechanism,
      boundary: opts.boundary ?? null,
      $exception_level: "error",
    });
    return true;
  } catch {
    return false;
  }
}

let installed = false;

/** Install the window listeners. Idempotent; call once at boot. */
export function installErrorListeners() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    // Resource load failures (img/script tags) arrive here without an error
    // object; they are not exceptions.
    if (!(event instanceof ErrorEvent)) return;
    reportError(event.error ?? event.message, { mechanism: "onerror" });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { mechanism: "onunhandledrejection" });
  });
}
