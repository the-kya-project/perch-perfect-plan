/**
 * /r/<token> — tracked links in the onboarding emails and The Flock Report.
 * Logs the click and 302s to the link's original destination. All the logic is
 * in emailClickHandler.server.ts.
 *
 * HEAD is answered too: link scanners often check a link with HEAD first, and
 * it must get the same redirect (and be logged as a bot) rather than a 404.
 */
import { createFileRoute } from "@tanstack/react-router";
import { withErrorTelemetry } from "@/lib/errorTelemetry";
import { handleEmailClick } from "@/lib/emailClickHandler.server";

export const Route = createFileRoute("/r/$token")({
  server: {
    handlers: {
      GET: withErrorTelemetry("/r/$token", ({ request, params }) => handleEmailClick(request, params.token)),
      HEAD: withErrorTelemetry("/r/$token", ({ request, params }) => handleEmailClick(request, params.token)),
    },
  },
});
