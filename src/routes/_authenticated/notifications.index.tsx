import { createFileRoute, redirect } from "@tanstack/react-router";

// /notifications was renamed to /scans. Keep this path alive so old links and
// bookmarks/installed-PWA shortcuts still resolve — redirect to the canonical
// /scans. (Internal links all point at /scans directly now.)
export const Route = createFileRoute("/_authenticated/notifications/")({
  beforeLoad: () => {
    throw redirect({ to: "/scans" });
  },
});
