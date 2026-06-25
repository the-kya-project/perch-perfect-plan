import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyOAuthAttribution } from "@/lib/attribution";
import { PullToRefresh } from "@/components/PullToRefresh";
import { OwnerTabBar } from "@/components/OwnerTabBar";

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
    pathname === "/welcome" || pathname === "/birds/new" ||
    pathname.endsWith("/setup") || pathname.endsWith("/view-as-sitter") ||
    // The sitter preview renders the sitter's OWN chrome (its iframe) — the
    // owner's bottom nav must not show under it.
    pathname.startsWith("/sit-preview");

  return (
    <>
      <PullToRefresh>
        <Outlet />
      </PullToRefresh>
      {!hideNav && <OwnerTabBar />}
    </>
  );
}
