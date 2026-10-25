import { createFileRoute, Outlet, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthClientStalled, getReadySession } from "@/lib/authReady";
import { readAuthLinkError } from "@/lib/authLinkError";
import { applyOAuthAttribution } from "@/lib/attribution";
import { ensureAccountTimeZone } from "@/lib/sitTimeZoneBackfill";
import { PullToRefresh } from "@/components/PullToRefresh";
import { OwnerTabBar, isTaskPath } from "@/components/OwnerTabBar";
import { StartupSplash } from "@/components/StartupSplash";
import { FLOCK_ENABLED_QUERY, rememberMode, rememberedMode } from "@/lib/flock";

/**
 * Send the reader elsewhere from a signed-in page.
 *
 * On the page's first load a router redirect races React. The server sent
 * this route's placeholder (it's ssr:false), and React is still checking that
 * against the server's HTML when beforeLoad decides to leave. The router swaps
 * its matches mid-check, React looks for the old one and gets undefined
 * ("Cannot read properties of undefined (reading 'routeId')"), and recovers
 * by rebuilding the page: React #422 + #520. That's the pair iPhones reported
 * on /auth in Oct 2026, from people opening an email link while signed out
 * (Mail opens Safari, which has no session). The iPhone hydration check
 * (e2e/) caught it on WebKit; slowing Chromium's CPU 6x reproduces it.
 *
 * So on the first load we leave with a real page load instead: the browser
 * fetches the destination fresh, with nothing half-checked to collide with.
 * Later, in-app navigations keep the normal router redirect. "First load"
 * means the router hasn't finished one yet (window.__kyaReady, set by
 * RootComponent). The router is held on the pending splash while the browser
 * leaves, and falls back to its own redirect if that somehow takes over 5s.
 */
async function leave(href: string, routerRedirect: () => never): Promise<never> {
  if (typeof window !== "undefined" && !(window as { __kyaReady?: boolean }).__kyaReady) {
    window.location.replace(href);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return routerRedirect();
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // An emailed link Supabase rejected (expired, already used, or replaced
    // by a newer email) comes back here, to /welcome, with no session. Without
    // this the guard below would bounce the reader to sign-in with no word of
    // what happened. /link-expired explains and offers a fresh link.
    const linkError = readAuthLinkError(location.searchStr, location.hash);
    if (linkError) {
      return leave(`/link-expired?reason=${encodeURIComponent(linkError.code)}`, () => {
        throw redirect({ to: "/link-expired", search: { reason: linkError.code }, replace: true });
      });
    }
    // Cold-start safe read: waits for the persisted session to hydrate from
    // storage before deciding (see authReady). Without this, a cold launch in
    // the native webview read null before hydration and bounced signed-in
    // owners to /auth. Still no network round-trip, and a session just set by
    // signup/sign-in is reflected immediately (auth already settled by then).
    let session;
    try {
      session = await getReadySession();
    } catch (e) {
      if (!(e instanceof AuthClientStalled)) throw e;
      // The auth client is wedged in this page and is not coming back. A router
      // redirect would keep it: /auth renders, the reader types their password,
      // and signInWithPassword awaits the same stuck promise — the hang just
      // moves to the sign-in button. So leave the page entirely and let the
      // client be built again from nothing.
      const to = `/auth?mode=signin&redirect=${encodeURIComponent(location.href)}`;
      if (typeof window !== "undefined") window.location.assign(to);
      // Still throw the router redirect: if the hard load is slow to take
      // effect the reader sees /auth rather than the spinner, and the full load
      // supersedes it a moment later.
      throw redirect({ to: "/auth", search: { mode: "signin" as const, redirect: location.href } });
    }
    if (!session) {
      // Remember where they were headed (e.g. a /past-birds email deep-link) so
      // /auth lands them there after sign-in instead of the default dashboard.
      // `href` keeps the query string: /birds/new?next=weight must survive.
      return leave(`/auth?mode=signin&redirect=${encodeURIComponent(location.href)}`, () => {
        throw redirect({ to: "/auth", search: { mode: "signin" as const, redirect: location.href } });
      });
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
  // Forest splash with the stacked lockup (shared with the root's recovery
  // screen). Static markup only — see above.
  return <StartupSplash />;
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
  const queryClient = useQueryClient();

  // Reopen in the mode this device was last in. Only when the app opens on its
  // default landing (Home), only once per app load, and only after the server
  // confirms flock_enabled(): anyone who isn't an admin always opens in care,
  // and a stale "flock" left on the device is cleared.
  useEffect(() => {
    if (rememberedMode() !== "flock" || window.location.pathname !== "/dashboard") return;
    let cancelled = false;
    void queryClient.fetchQuery(FLOCK_ENABLED_QUERY).catch(() => false).then((enabled) => {
      if (cancelled) return;
      if (enabled) void navigate({ to: "/flock", replace: true });
      else rememberMode("care");
    });
    return () => { cancelled = true; };
    // Once per app load: later visits to Home are deliberate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      // Save this device's zone as the account's home zone the first time (sits
      // follow the account zone, so travel never moves a sitter link's end).
      if (!cancelled && data.session?.user) void ensureAccountTimeZone(data.session.user.id);
    });
    return () => { cancelled = true; };
  }, []);

  // Persistent owner bottom nav on every authenticated screen. Two deliberate
  // exceptions: the add-bird/setup wizard (SetupShell renders its own nav stacked
  // with the wizard footer), and the one-time welcome splash.
  const hideNav = useLocation({ select: (l) =>
    l.pathname === "/welcome" || l.pathname === "/birds/new" ||
    l.pathname.endsWith("/setup") || l.pathname.endsWith("/view-as-sitter") ||
    // The sitter preview renders the sitter's OWN chrome (its iframe) — the
    // owner's bottom nav must not show under it.
    l.pathname.startsWith("/sit-preview") ||
    // The Flock has its own bar (FlockShell).
    l.pathname === "/flock" || l.pathname.startsWith("/flock/") ||
    // Tasks (daily check, full health check, set up / edit a sit, edit a
    // bird's identity) end with one pinned button instead of the nav.
    isTaskPath(l.pathname, l.search as Record<string, unknown>) });

  return (
    <>
      <PullToRefresh>
        <Outlet />
      </PullToRefresh>
      {!hideNav && <OwnerTabBar />}
    </>
  );
}
