import { createFileRoute, Outlet } from "@tanstack/react-router";

// Layout for the /plan route. The overview lives in the index child
// ($birdId.plan.index.tsx) and the section editor in $birdId.plan.editor.tsx;
// both render into this <Outlet/>. Before this split the overview WAS this
// route's component (no Outlet), so /plan/editor — nested under it — had
// nowhere to render and tapping a section row appeared to do nothing.
export const Route = createFileRoute("/_authenticated/birds/$birdId/plan")({
  component: () => <Outlet />,
});
