/**
 * /get-app — the app-launch email's download links.
 *
 * Everything routes through here so taps can be counted per CTA, but the reader
 * still lands on the store itself rather than an interstitial. Only a desktop
 * (or anything we cannot identify) sees a page, and that page's job is to get
 * the link onto a phone.
 *
 *   /get-app                  iPhone -> App Store, Android -> Play, else chooser
 *   /get-app?store=ios        always the App Store
 *   /get-app?store=android    always Google Play
 */
import { createFileRoute } from "@tanstack/react-router";
import { STORE, logClick, resolveTarget } from "@/lib/storeRedirect.server";
import { chooserPage } from "@/lib/storeChooserPage.server";

export const Route = createFileRoute("/get-app")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ua = request.headers.get("user-agent") ?? "";
        const resolved = resolveTarget(ua, url.searchParams.get("store"));
        await logClick({ path: "get-app", url, userAgent: ua, resolved });

        if (resolved === "chooser") {
          return new Response(chooserPage("get"), {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
          });
        }
        return new Response(null, {
          status: 302,
          headers: { location: resolved === "ios" ? STORE.ios : STORE.android, "cache-control": "no-store" },
        });
      },
    },
  },
});
