/**
 * /r/<token> — tracked links in the onboarding emails and The Flock Report.
 * Logs the click and 302s to the link's original destination. All the logic is
 * in emailClickHandler.server.ts.
 *
 * HEAD is answered too: link scanners often check a link with HEAD first, and
 * it must get the same redirect (and be logged as a bot) rather than a 404.
 *
 * The handler is imported inside the request, not at the top: route files are
 * also bundled for the browser, and the handler signs with node:crypto.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withErrorTelemetry } from "@/lib/errorTelemetry";

async function handle({ request, params }: { request: Request; params: { token: string } }) {
  const { handleEmailClick } = await import("@/lib/emailClickHandler.server");
  return handleEmailClick(request, params.token);
}

export const Route = createFileRoute("/r/$token")({
  server: {
    handlers: {
      GET: withErrorTelemetry("/r/$token", handle),
      HEAD: withErrorTelemetry("/r/$token", handle),
    },
  },
});
