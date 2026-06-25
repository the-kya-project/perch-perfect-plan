import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /scans (inbox) and /scans/settings. Canonical path for the scans
// surface; /notifications redirects here for old/bookmarked links.
export const Route = createFileRoute("/_authenticated/scans")({
  component: () => <Outlet />,
});
