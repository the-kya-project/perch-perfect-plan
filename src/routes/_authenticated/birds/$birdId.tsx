import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/birds/$birdId")({
  component: () => <Outlet />,
});