/**
 * /get — the short download link for TikTok and Instagram bios, story links
 * and paid ads.
 *
 * Deliberately short, because it gets typed and read aloud. Behaviour is
 * identical to /get-app (same detection, same store links, same logging); the
 * only difference is that visits are recorded as `get`, which is what
 * separates paid-social traffic from the launch email's own links.
 *
 * The logic lives in storeRedirectHandler.server so there is exactly one copy.
 */
import { createFileRoute } from "@tanstack/react-router";
import { handleStoreRedirect } from "@/lib/storeRedirectHandler.server";

export const Route = createFileRoute("/get")({
  server: {
    handlers: {
      GET: ({ request }) => handleStoreRedirect(request, { path: "get", basePath: "/get" }),
    },
  },
});
