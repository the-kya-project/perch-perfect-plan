import { createFileRoute, redirect } from "@tanstack/react-router";

// Permissions now live on the Household screen: tap a member to choose which
// birds they help with and what they can do. This route stays so old links
// and bookmarks land in the right place.
export const Route = createFileRoute("/_authenticated/household-permissions")({
  beforeLoad: () => {
    throw redirect({ to: "/household" });
  },
});
