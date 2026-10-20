/**
 * /.well-known/assetlinks.json — lets Android verify that the Kya & Co. app
 * may open links on this host (App Links). Same answer on both hosts.
 *
 * The fingerprint comes from ANDROID_APP_SIGNING_SHA256 (see appLinks.ts).
 * Until it's set this returns [], and Android keeps opening links in the
 * browser. Must be a 200 with no redirect, or verification fails.
 */
import { createFileRoute } from "@tanstack/react-router";
import { assetLinks, parseFingerprints } from "@/lib/appLinks";

function handle() {
  return Response.json(assetLinks(parseFingerprints(process.env.ANDROID_APP_SIGNING_SHA256)), {
    headers: { "cache-control": "public, max-age=3600" },
  });
}

export const Route = createFileRoute("/.well-known/assetlinks.json")({
  server: { handlers: { GET: handle } },
});
