/**
 * Forget which build this browser is pinned to, right before the app reloads
 * onto a new one (backlog 2.4).
 *
 * Vercel's Skew Protection pins an open page to the build it opened with (the
 * __vdpl cookie), so its code files keep loading after a release. When the
 * app moves onto the new build it reloads, and the fresh page should be
 * pinned to the new build. On Nov 2, 2026 the iOS web view kept the old pin
 * through a reload, so the owner's sitter preview (whose page is always the
 * newest build) still got its code files from the old build and stalled.
 * Expiring the cookie first means the reload starts unpinned (sw-register.ts,
 * unpinBuild). The rules are in lib/releaseCheck.ts.
 *
 * Public on purpose: it only removes a routing cookie, never anything about
 * the person. The service worker never handles /api/.
 */
import { createFileRoute } from "@tanstack/react-router";
import { UNPIN_SET_COOKIE } from "@/lib/releaseCheck";

export const Route = createFileRoute("/api/public/unpin")({
  server: {
    handlers: {
      POST: () =>
        new Response(null, {
          status: 204,
          headers: {
            "cache-control": "no-store",
            "set-cookie": UNPIN_SET_COOKIE,
          },
        }),
    },
  },
});
