// Telemetry for the public cron hooks (care-plan-reminders, engagement-nudges,
// onboarding-emails). Emits one `cron_hook_run` PostHog event per invocation on
// EVERY path — success, 401, 503, or a thrown error — so we can alert on both
// failure (a non-200 run) and absence (a hook that should have run but didn't;
// silence otherwise looks identical to health).
//
// Invoked only from the server route handlers, but kept dependency-free and
// isomorphic (fetch + AbortController only, no server-only imports) because
// these route files are part of the client route tree (routeTree.gen.ts) — a
// top-level `.server`-only import would break the client bundle. No secret is
// read or logged here.
//
// Capture is fire-and-forget but AWAITED before the handler returns: work kicked
// off after the response is frozen on Vercel and would silently never send. A
// short AbortController timeout plus a full error-swallow guarantee the capture
// can never slow down or break the hook.

// Public PostHog project key — the same client identifier analytics.ts already
// ships in every page. Kept a literal on purpose: a Vercel env var for this key
// previously 500'd production (see src/lib/analytics.ts).
const POSTHOG_KEY = "phc_qkMPyAbqFHDcG6FdXFBQUsiyPsbMjbCX2hNSw2bddPKh";
const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/capture/";
const CAPTURE_TIMEOUT_MS = 2000;

async function captureCronHookRun(properties: Record<string, unknown>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAPTURE_TIMEOUT_MS);
  try {
    await fetch(POSTHOG_CAPTURE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: "cron_hook_run",
        distinct_id: "cron-hooks",
        properties,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    // A PostHog outage/timeout must never affect the hook. Swallow + log only.
    console.error("[cron-telemetry] capture failed:", err instanceof Error ? err.message : String(err));
  } finally {
    clearTimeout(timer);
  }
}

type CronHandler<C extends { request: Request }> = (ctx: C) => Promise<Response>;

/**
 * Wrap a cron hook handler so every invocation emits a `cron_hook_run` event
 * carrying the hook name, HTTP status, duration, and the hook's own JSON result
 * (planned/sent/considered/…) when present. The wrapped handler's behavior and
 * response are unchanged.
 */
export function withCronTelemetry<C extends { request: Request }>(
  hook: string,
  handler: CronHandler<C>,
): CronHandler<C> {
  return async (ctx: C): Promise<Response> => {
    const started = Date.now();
    let response: Response;
    try {
      response = await handler(ctx);
    } catch (err) {
      await captureCronHookRun({
        hook,
        status: 500,
        duration_ms: Date.now() - started,
        threw: true,
        error: err instanceof Error ? err.message : String(err),
      });
      throw err; // behavior unchanged — the hook still fails exactly as before
    }
    // Best-effort: read the hook's JSON result without disturbing the response
    // handed back to the caller. Non-JSON bodies (e.g. the 401 text) are skipped.
    let result: Record<string, unknown> | undefined;
    try {
      if ((response.headers.get("content-type") ?? "").includes("application/json")) {
        result = await response.clone().json();
      }
    } catch {
      /* non-JSON body or parse failure — omit result props */
    }
    await captureCronHookRun({
      hook,
      status: response.status,
      duration_ms: Date.now() - started,
      ...(result ? { ok: result.ok, result } : {}),
    });
    return response;
  };
}
