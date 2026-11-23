/**
 * Which web build is live: `{ "build": "<7-char commit>" }`, never cached.
 *
 * The iOS app has no service worker (WKWebView only offers one to apps that
 * declare app-bound domains), so nothing told an open app that a release had
 * gone out. It kept running the old build, whose code files the release had
 * removed from the server, and the next screen it hadn't loaded yet failed
 * (Nov 2, 2026: the sitter preview and its Close button). Open pages will ask
 * this endpoint instead (lib/releaseCheck.ts holds the rules; backlog 2.3
 * wires them in) and move onto the new build at the same safe moments as a
 * service-worker update.
 *
 * Public on purpose: the commit is already in every page's error tags and
 * reveals nothing about anyone. The service worker never handles /api/, so
 * the answer always comes from the server.
 */
import { createFileRoute } from "@tanstack/react-router";
import { WEB_BUILD } from "@/lib/errorTags";

export const Route = createFileRoute("/api/public/version")({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify({ build: WEB_BUILD }), {
          status: 200,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store, max-age=0",
          },
        }),
    },
  },
});
