import { createFileRoute, redirect } from "@tanstack/react-router";

// The chapter's members moved into the Chapter tab (Members). Old links land there.
export const Route = createFileRoute("/_authenticated/flock/members/")({
  beforeLoad: () => {
    throw redirect({ to: "/flock/chapter", search: { tab: "members" }, replace: true });
  },
});
