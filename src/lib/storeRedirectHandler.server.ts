/**
 * The shared GET handler behind /get and /get-app.
 *
 * One implementation on purpose: the two paths are the same product surface
 * reached from different places (a TikTok or Instagram bio vs. the launch
 * email), and the only thing that differs is the name recorded against the
 * visit. A second copy of the device detection would drift from this one.
 *
 *   /get                  iPhone -> App Store, Android -> Play, else chooser
 *   /get?store=ios        always the App Store
 *   /get?store=android    always Google Play
 *
 * Incoming UTMs are carried into the store links so App Store Connect and the
 * Play Console can attribute installs to the ad or video that drove them.
 *
 * LOGGING NEVER DELAYS THE REDIRECT. The insert races a short timer and the
 * redirect goes out regardless — a slow or broken metric must not stand
 * between someone and the app.
 */
import {
  appStoreUrl,
  logClick,
  playStoreUrl,
  readUtms,
  resolveTarget,
  type ClickPath,
} from "./storeRedirect.server";
import { chooserPage } from "./storeChooserPage.server";

/** How long the redirect is willing to wait for the metric. */
const LOG_BUDGET_MS = 400;

/**
 * `Vary: User-Agent` matters more than it looks. Every response here is
 * decided from the user agent, so a cache that keyed only on the URL could
 * hand an iPhone visitor the Play Store. `no-store` already prevents that on
 * Vercel's CDN; Vary states the dependency for every other cache in the path
 * — a corporate proxy, an in-app browser's own cache — that may honour one
 * header and not the other.
 */
const VARY = "User-Agent";

export async function handleStoreRedirect(
  request: Request,
  entry: { path: Extract<ClickPath, "get" | "get-app">; basePath: "/get" | "/get-app" },
): Promise<Response> {
  const url = new URL(request.url);
  const ua = request.headers.get("user-agent") ?? "";
  const referrer = request.headers.get("referer");
  // Vercel resolves this at the edge. We never read or store the IP itself.
  const country = request.headers.get("x-vercel-ip-country");
  const resolved = resolveTarget(ua, url.searchParams.get("store"));
  const utms = readUtms(url);

  // Bounded on purpose. Awaited rather than fire-and-forget because a
  // serverless function can be frozen the moment it responds, which would drop
  // the row; bounded because the visitor must not wait on it.
  await Promise.race([
    logClick({ path: entry.path, url, userAgent: ua, resolved, referrer, country }).catch((e) => {
      console.error(`[${entry.path}] click log failed`, e instanceof Error ? e.message : e);
    }),
    new Promise((r) => setTimeout(r, LOG_BUDGET_MS)),
  ]);

  if (resolved === "chooser") {
    return new Response(chooserPage("get", utms, entry.basePath), {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        vary: VARY,
      },
    });
  }

  // Only ever one of two hardcoded store hosts — nothing from the query string
  // reaches the Location header, so there is no open redirect here.
  return new Response(null, {
    status: 302,
    headers: {
      location: resolved === "ios" ? appStoreUrl(utms) : playStoreUrl(utms),
      "cache-control": "no-store",
      vary: VARY,
    },
  });
}
