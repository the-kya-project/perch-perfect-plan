import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMySetup } from "@/lib/flockData";
import { isFlockOnboardingPath } from "@/lib/flockNav";
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
  // First visit: the welcome, then the one-minute setup. Once setup is saved
  // (flock_profiles.setup_completed_at) it never shows again.
  const pathname = useLocation({ select: (l) => l.pathname });
  const navigate = useNavigate();
  const { data: setup } = useMySetup();
  const needsSetup = !!setup && !setup.setup_completed_at;
  useEffect(() => {
    if (needsSetup && !isFlockOnboardingPath(pathname)) void navigate({ to: "/flock/welcome", replace: true });
  }, [needsSetup, pathname, navigate]);
  return (
    <FlockShell>
      <Outlet />
    </FlockShell>
  );
}
