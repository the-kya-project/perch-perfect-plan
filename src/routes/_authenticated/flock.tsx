import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMySetup } from "@/lib/flockData";
import { isFlockOnboardingPath } from "@/lib/flockNav";
import { FlockShell } from "@/components/FlockShell";
import { FLOCK_ENABLED_QUERY, rememberMode } from "@/lib/flock";
import { FLOCK_ACCESS_QUERY, isJoinPath, isRescuePath, joinRedirect } from "@/lib/flockJoin";

// The Flock: a separate mode of the app, admins only until launch.
//
// Opening to members (build C): once opening day is set AND the members switch
// is on, flock_enabled() is also true for any signed-in account. Then the
// second check below decides: someone who hasn't joined, or hasn't agreed to
// the current guidelines, or whose membership starts on opening day, is sent
// to the join step (/flock/join). Admins pass straight through.
//
// The gate is the server, not the hidden button: flock_enabled() (an RPC that
// is true only for admins) runs before anything here renders. Anyone else who
// opens a /flock URL is sent Home without a word, and this device is put back
// in care mode. The answer is cached with the tab bar's (FLOCK_ENABLED_QUERY),
// so an admin tapping in doesn't wait on a second round-trip.
export const Route = createFileRoute("/_authenticated/flock")({
  beforeLoad: async ({ context, location }) => {
    const enabled = await context.queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false);
    if (!enabled) {
      rememberMode("care");
      throw redirect({ to: "/dashboard", replace: true });
    }
    const access = await context.queryClient.fetchQuery(FLOCK_ACCESS_QUERY).catch(() => null);
    const to = joinRedirect(access, location.pathname);
    if (to === "/dashboard") rememberMode("care");
    if (to) throw redirect({ to, search: to === "/flock/join" ? (location.search as never) : undefined, replace: true });
  },
  component: FlockLayout,
});

function FlockLayout() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const { data: access } = useQuery(FLOCK_ACCESS_QUERY);
  // The join step and the rescue code form, and the guidelines before you're
  // a member, render without the member chrome (which reads member-only data).
  const inside = !!access && (access.is_admin || (access.agreed && access.member_now));
  if (pathname.startsWith("/flock/join") || isRescuePath(pathname) || (isJoinPath(pathname) && !inside)) return <JoinFrame />;
  return <MemberFlock pathname={pathname} />;
}

function JoinFrame() {
  return <Outlet />;
}

function MemberFlock({ pathname }: { pathname: string }) {
  // Reaching the Flock by any route (the tab, a link, a typed URL) makes it
  // this device's mode, so reopening the app returns here.
  useEffect(() => { rememberMode("flock"); }, []);
  // First visit: the welcome, then the one-minute setup. Once setup is saved
  // (flock_profiles.setup_completed_at) it never shows again.
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
