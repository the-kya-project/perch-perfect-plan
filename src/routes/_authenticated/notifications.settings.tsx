import { createFileRoute, redirect } from "@tanstack/react-router";

// Renamed to /scans/settings — redirect old links here.
export const Route = createFileRoute("/_authenticated/notifications/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/scans/settings" });
  },
});
