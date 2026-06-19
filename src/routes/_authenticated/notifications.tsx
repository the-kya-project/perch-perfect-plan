import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /notifications (inbox) and /notifications/settings.
export const Route = createFileRoute("/_authenticated/notifications")({
  component: () => <Outlet />,
});
