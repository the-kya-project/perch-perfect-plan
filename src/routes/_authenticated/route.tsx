import { createFileRoute, Outlet, redirect, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getReadySession } from "@/lib/authReady";
import { applyOAuthAttribution } from "@/lib/attribution";
import { PullToRefresh } from "@/components/PullToRefresh";
import { OwnerTabBar } from "@/components/OwnerTabBar";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Cold-start safe read: waits for the persisted session to hydrate from
    // storage before deciding (see authReady). Without this, a cold launch in
    // the native webview read null before hydration and bounced signed-in
    // owners to /auth. Still no network round-trip, and a session just set by
    // signup/sign-in is reflected immediately (auth already settled by then).
    const session = await getReadySession();
    if (!session) {
      // Remember where they were headed (e.g. a /past-birds email deep-link) so
      // /auth lands them there after sign-in instead of the default dashboard.
      throw redirect({ to: "/auth", search: { mode: "signin" as const, redirect: location.pathname } });
    }
    return { user: session.user };
  },
  // With ssr:false, the session check (and any redirect) is resolved on the
  // client. The server renders THIS pending component for the boundary, and the
  // client renders the same thing during hydration before beforeLoad resolves —
  // so server and client produce identical initial output (no hydration
  // mismatch / React #418, which otherwise flashes the root errorComponent —
  // "This page didn't load" — for ~1s on every navigation). It must be
  // deterministic: no window/Date/auth reads.
  pendingComponent: AuthPending,
  component: AuthenticatedLayout,
});

function AuthPending() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--cream)]" aria-hidden>
      <Loader2 className="size-5 animate-spin text-[var(--moss)]" />
    </div>
  );
}

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
