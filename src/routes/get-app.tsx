/**
 * /get-app — the download link the launch email hands out.
 *
 * Already in people's inboxes, so the path and its ?store= overrides stay
 * exactly as they were. The implementation moved to
 * storeRedirectHandler.server, shared with /get; visits are still recorded as
 * `get-app` so existing reporting is unchanged.
 *
 *   /get-app                  iPhone -> App Store, Android -> Play, else chooser
 *   /get-app?store=ios        always the App Store
 *   /get-app?store=android    always Google Play
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleStoreRedirect } from "@/lib/storeRedirectHandler.server";

export const Route = createFileRoute("/get-app")({
  server: {
    handlers: {
      GET: ({ request }) => handleStoreRedirect(request, { path: "get-app", basePath: "/get-app" }),
    },
  },
});
