import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
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

/**
 * Is this response Supabase telling us the signed-in user no longer exists?
 *
 * Deliberately narrow. A deleted account must sign the device out, but a flaky
 * network must NOT — so we only act on an explicit "this user is gone" answer,
 * never on a generic failure, timeout, or offline error.
 */
function isUserGone(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "user_not_found") return true;
  return /user.*(not found|does not exist)/i.test(error.message ?? "");
}

function AuthenticatedLayout() {
  const navigate = useNavigate();

  // An account deleted ELSEWHERE — another device, or server-side — leaves this
  // device holding a session for a user that no longer exists. The guard above
  // can't catch it: the JWT is still well-formed and unexpired, so getSession()
  // happily returns it and the app renders a nameless onboarding screen. The
  // first write then failed with a raw foreign-key error.
  //
  // So verify with the server ONCE after mount, in the background. Deliberately
  // not in beforeLoad: getUser() is a network round-trip that previously raced
  // signup and slowed every cold start, which is why the guard uses getSession()
  // (see authReady). Nothing here blocks first paint.
  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ error }) => {
      if (cancelled || !isUserGone(error as { code?: string; message?: string } | null)) return;
      void supabase.auth.signOut().finally(() => {
        if (!cancelled) void navigate({ to: "/auth", search: { mode: "signin" as const } });
      });
    });
    return () => { cancelled = true; };
  }, [navigate]);

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
