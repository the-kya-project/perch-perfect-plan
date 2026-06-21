import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyOAuthAttribution } from "@/lib/attribution";
import { PullToRefresh } from "@/components/PullToRefresh";
import { OwnerTabBar } from "@/components/OwnerTabBar";

// Per-device owner onboarding/checklist flags (the welcome splash, the checklist
// dismissal, the self-attested checklist steps) live in localStorage and are NOT
// account-scoped. When a different account signs in on the same browser, clear
// them so the new account gets the first-run flow — otherwise a second account
// created on a device that already onboarded sees no welcome and no checklist.
// Account-level state (welcome_seen_at) still prevents re-showing for the SAME
// account across devices. Runs in beforeLoad so it completes before the dashboard
// (and OwnerOnboarding/OwnerChecklist) mount and read these flags.
const LAST_UID_KEY = "ppc_last_uid";
function resetOwnerDeviceFlagsOnAccountChange(uid: string) {
  if (typeof window === "undefined") return;
  try {
    const prev = window.localStorage.getItem(LAST_UID_KEY);
    if (prev && prev !== uid) {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith("ppc_owner_")) window.localStorage.removeItem(k);
      }
    }
    if (prev !== uid) window.localStorage.setItem(LAST_UID_KEY, uid);
  } catch { /* storage blocked — first-run flow still gated by welcome_seen_at */ }
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // Read the session from local storage (no network round-trip): fast on every
    // authenticated navigation, and it immediately reflects a session just set by
    // signup/sign-in. getUser()'s network call raced that and bounced new owners
    // back to sign-in right after signup.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) {
      throw redirect({ to: "/auth", search: { mode: "signin" as const } });
    }
    resetOwnerDeviceFlagsOnAccountChange(data.session.user.id);
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  // OAuth signups can't carry attribution metadata through the provider
  // round-trip, so fill it client-side on return. No-ops for users who already
  // have attribution or aren't freshly created (see applyOAuthAttribution).
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session?.user) void applyOAuthAttribution(data.session.user as any);
    });
    return () => { cancelled = true; };
  }, []);

  // Persistent owner bottom nav on every authenticated screen. Two deliberate
  // exceptions: the add-bird/setup wizard (SetupShell renders its own nav stacked
  // with the wizard footer), and the one-time welcome splash.
  const pathname = useLocation({ select: (l) => l.pathname });
  const hideNav =
    pathname === "/welcome" || pathname === "/birds/new" || pathname.endsWith("/setup");

  return (
    <>
      <PullToRefresh>
        <Outlet />
      </PullToRefresh>
      {!hideNav && <OwnerTabBar />}
    </>
  );
}
