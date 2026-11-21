import { createFileRoute, redirect } from "@tanstack/react-router";
import { FLOCK_REDIRECTS } from "@/lib/flockNav";

// The old Spaces placeholder: spaces are the header's sheet now, filtering
// Today. Kept as a redirect so saved links don't 404.
export const Route = createFileRoute("/_authenticated/flock/spaces")({
  beforeLoad: () => { throw redirect({ to: FLOCK_REDIRECTS["/flock/spaces"], replace: true }); },
});
