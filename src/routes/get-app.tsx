/**
 * /get-app — every download link we hand out, from the launch email and from
 * TikTok bios.
 *
 * Everything routes through here so visits can be counted per campaign, but the
 * visitor still lands on the store itself rather than an interstitial. Only a
 * desktop (or anything we cannot identify) sees a page, and that page's job is
 * to get the link onto a phone.
 *
 *   /get-app                  iPhone -> App Store, Android -> Play, else chooser
 *   /get-app?store=ios        always the App Store
 *   /get-app?store=android    always Google Play
 *
 * Incoming UTMs are carried into the store links so App Store Connect and the
 * Play Console can attribute downloads to the video that drove them.
 *
 * LOGGING NEVER DELAYS THE REDIRECT. The insert races a short timer and the
 * redirect goes out regardless — a slow or broken metric must not stand between
 * someone and the app.
 */
import { createFileRoute } from "@tanstack/react-router";
import { appStoreUrl, logClick, playStoreUrl, readUtms, resolveTarget } from "@/lib/storeRedirect.server";
import { chooserPage } from "@/lib/storeChooserPage.server";

/** How long the redirect is willing to wait for the metric. */
const LOG_BUDGET_MS = 400;

export const Route = createFileRoute("/get-app")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ua = request.headers.get("user-agent") ?? "";
        const referrer = request.headers.get("referer");
        const resolved = resolveTarget(ua, url.searchParams.get("store"));
        const utms = readUtms(url);

        // Bounded on purpose. Awaited rather than fire-and-forget because a
        // serverless function can be frozen the moment it responds, which would
        // drop the row; bounded because the visitor must not wait on it.
        await Promise.race([
          logClick({ path: "get-app", url, userAgent: ua, resolved, referrer }).catch((e) => {
            console.error("[get-app] click log failed", e instanceof Error ? e.message : e);
          }),
          new Promise((r) => setTimeout(r, LOG_BUDGET_MS)),
        ]);

        if (resolved === "chooser") {
          return new Response(chooserPage("get", utms), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
          });
        }
        return new Response(null, {
          status: 302,
          headers: {
            location: resolved === "ios" ? appStoreUrl(utms) : playStoreUrl(utms),
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
