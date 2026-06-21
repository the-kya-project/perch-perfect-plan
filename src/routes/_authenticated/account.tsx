import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for /account (index) and /account/security. A bare Outlet — each child
// renders its own full screen. (Without this, the security child had nowhere to
// render and the link appeared to go nowhere.)
export const Route = createFileRoute("/_authenticated/account")({
  component: () => <Outlet />,
});
