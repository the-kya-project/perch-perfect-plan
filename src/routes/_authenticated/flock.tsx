import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { FlockShell } from "@/components/FlockShell";
import { FLOCK_ENABLED_QUERY, rememberMode } from "@/lib/flock";

// The Flock: a separate mode of the app, admins only until launch.
//
// The gate is the server, not the hidden button: flock_enabled() (an RPC that
// is true only for admins) runs before anything here renders. Anyone else who
// opens a /flock URL is sent Home without a word, and this device is put back
// in care mode. The answer is cached with the tab bar's (FLOCK_ENABLED_QUERY),
// so an admin tapping in doesn't wait on a second round-trip.
export const Route = createFileRoute("/_authenticated/flock")({
  beforeLoad: async ({ context }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) {
      rememberMode("care");
      throw redirect({ to: "/dashboard", replace: true });
    }
  },
  component: FlockLayout,
});

function FlockLayout() {
  // Reaching the Flock by any route (the tab, a link, a typed URL) makes it
  // this device's mode, so reopening the app returns here.
  useEffect(() => { rememberMode("flock"); }, []);
  return (
    <FlockShell>
      <Outlet />
    </FlockShell>
  );
}
