/**
 * /review — the app-launch email's "Leave a review" link.
 *
 * Same shape as /get-app: counted here, but the reader lands on the store's own
 * review flow. Only a desktop sees a page.
 */
import { createFileRoute } from "@tanstack/react-router";
import { STORE, logClick, resolveTarget } from "@/lib/storeRedirect.server";
import { chooserPage } from "@/lib/storeChooserPage.server";

export const Route = createFileRoute("/review")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ua = request.headers.get("user-agent") ?? "";
        const resolved = resolveTarget(ua, url.searchParams.get("store"));
        // Bounded, same as /get-app: the metric must never delay the redirect.
        await Promise.race([
          logClick({ path: "review", url, userAgent: ua, resolved, referrer: request.headers.get("referer") }).catch((e) => {
            console.error("[review] click log failed", e instanceof Error ? e.message : e);
          }),
          new Promise((r) => setTimeout(r, 400)),
        ]);

        if (resolved === "chooser") {
          return new Response(chooserPage("review"), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
          });
        }
        return new Response(null, {
          status: 302,
          headers: {
            location: resolved === "ios" ? STORE.iosReview : STORE.androidReview,
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
