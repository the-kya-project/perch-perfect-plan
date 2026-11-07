import { createFileRoute, redirect } from "@tanstack/react-router";
import { FLOCK_REDIRECTS } from "@/lib/flockNav";

// The old Learn placeholder is the Library now. Kept as a redirect so saved
// links don't 404.
export const Route = createFileRoute("/_authenticated/flock/learn")({
  beforeLoad: () => { throw redirect({ to: FLOCK_REDIRECTS["/flock/learn"], replace: true }); },
});
