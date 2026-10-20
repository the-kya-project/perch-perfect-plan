/**
 * /.well-known/apple-app-site-association — tells iOS which links on this host
 * open the Kya & Co. app (Universal Links). The list lives in appLinks.ts.
 *
 * Apple's CDN fetches this, so it must be served as JSON with a 200 and no
 * redirect. It's host-aware: app.thekyaproject.com lists the app's screens,
 * links.thekyaproject.com lists only the email click tracker.
 */
import { createFileRoute } from "@tanstack/react-router";
import { appleAppSiteAssociation, CLICK_LINK_HOST } from "@/lib/appLinks";

function handle({ request }: { request: Request }) {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").split(":")[0];
  return Response.json(appleAppSiteAssociation(host === CLICK_LINK_HOST ? CLICK_LINK_HOST : undefined), {
    headers: { "cache-control": "public, max-age=3600" },
  });
}

export const Route = createFileRoute("/.well-known/apple-app-site-association")({
  server: { handlers: { GET: handle } },
});
