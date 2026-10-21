import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import { Loader2 } from "lucide-react";
import { globalI18n } from "@/lib/i18n";

import appCss from "../styles.css?url";
import { installErrorListeners, primeAccountRole, registerErrorReportingContext, reportError } from "@/lib/errorReporting";
import { SUPPORT_EMAIL } from "@/lib/support";
import { ERROR_TEST_ACCOUNT, errorTestMessage } from "@/lib/errorTest"; // TEMPORARY
import { fireServerErrorTest } from "@/lib/errorTest.functions"; // TEMPORARY
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { initAnalytics, identifyUser, resetUser } from "@/lib/analytics";
import { ensureProfileLocale } from "@/lib/ensureProfileLocale";
import { applyOwnerLocale } from "@/lib/i18n/ownerLocale";
import {
  registerServiceWorker, installChunkErrorRecovery, hardResetAndReload,
  isStaleChunkError, staleChunkRecoveryExhausted, reloadForStaleChunk,
  markAppHealthySoon, STARTUP_FAILED_EVENT,
} from "@/lib/sw-register";
import { captureFirstTouch } from "@/lib/attribution";
import { attachNativePushHandlers, syncNativePushToken } from "@/lib/pushNative";
import { attachAppLinkHandler } from "@/lib/appLinkNative";
import { smartAppBannerContent } from "@/lib/appLinks";
import { savePushToken } from "@/lib/push.functions";
// Side-effect import: registers the beforeinstallprompt/appinstalled listeners
// at app start so the native install prompt is captured (it fires once, early).

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">{t("root.pageNotFound", "Page not found")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("root.pageNotFoundBody", "The page you're looking for doesn't exist or the sitter link is invalid.")}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("root.goHome", "Go home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: ErrorComponentProps) {
  console.error(error);
  // A stale-build chunk 404 (lazy route import after a deploy swapped the
  // precache) is SELF-HEALING: installChunkErrorRecovery reloads onto the fresh
  // build. Rendering the error screen during that window reads as "the app
  // broke" — show a calm loader instead and trigger the reload ourselves
  // (belt-and-braces with the vite:preloadError listener). It gets ONE
  // automatic attempt (see reloadForStaleChunk); if the page that comes back
  // still can't load, this shows the error screen and never reloads again.
  const recovering = isStaleChunkError(error) && !staleChunkRecoveryExhausted();
  useEffect(() => {
    if (recovering) reloadForStaleChunk();
    else reportError(error, { mechanism: "react_error_boundary", boundary: "root" });
  }, [error, recovering]);
  if (recovering) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--cream)]" aria-hidden>
        <Loader2 className="size-5 animate-spin text-[var(--moss)]" />
      </div>
    );
  }
  return <SomethingWentWrong />;
}

/** The error screen: "Something went wrong" and a Reload button that clears
 *  the service worker and caches before loading fresh. The raw error message
 *  is deliberately NOT shown: it means nothing to the person reading it and
 *  can quote data back. It goes to the error report. */
function SomethingWentWrong() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{t("root.somethingWentWrong", "Something went wrong")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("root.errorBodyReload", "Sorry, the app didn't load properly. Tap Reload, and if it keeps happening, email us at {{email}}.", { email: SUPPORT_EMAIL })}
        </p>
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => { void hardResetAndReload(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("root.reload", "Reload")}
          </button>
        </div>
      </div>
    </div>
  );
}

// Render-blocking, dependency-free inline script emitted into <head> (classic
// <script>, so it runs before the deferred type="module" app bundle in the
// body). Closes the cold-launch hole where a signed-in owner lands on the
// marketing/sign-in page: "/" is SSR'd, so its beforeLoad guard runs
// server-side (no window, early return) and the client reuses the dehydrated
// match on hydration WITHOUT re-running beforeLoad — the synchronous guard
// never fires on a cold launch. This script does the redirect from raw HTML,
// before any React code, and only on "/". Mirrors hasStoredSession()'s key +
// shape logic. Any throw is swallowed so a failure here can never block the
// page from rendering. No query param / cache-buster — must not interact with
// sw-register's stale-chunk recovery. Delivered via head().scripts (not a raw
// <script> in the shell) so TanStack's <Script> renders it with
// suppressHydrationWarning — React 19 otherwise drops a bare inline head script.
const COLD_LAUNCH_REDIRECT = `(function(){try{` +
  `if(window.location.pathname!=="/")return;` +
  `var ks=Object.keys(localStorage);` +
  `for(var i=0;i<ks.length;i++){var k=ks[i];` +
  `if(!/^sb-.*-auth-token$/.test(k))continue;` +
  `var raw=localStorage.getItem(k);if(!raw)continue;` +
  `var p=JSON.parse(raw);` +
  `if(p&&(p.access_token||p.refresh_token||(p.currentSession&&p.currentSession.access_token))){` +
  // Inner try/catch: a marker-write failure (blocked/quota'd/private-mode
  // storage) must NOT swallow the redirect — that would reintroduce the exact
  // cold-launch bug on the devices least likely to report it.
  `try{sessionStorage.setItem("kya_cold_redirect",JSON.stringify({path:window.location.pathname,had_stored:true}));}catch(e2){}` +
  `window.location.replace("/dashboard");return;}}` +
  `}catch(e){}})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    scripts: [{ children: COLD_LAUNCH_REDIRECT }],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "robots", content: "noindex,nofollow" },
      // Ink (--ink) — matches the home-screen icon background for splash continuity.
      { name: "theme-color", content: "#1a3d2e" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      // Status bar sits cleanly over the ink hero / launch background.
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      // iOS reads THIS first for the Add-to-Home-Screen label (falls back to
      // <title> otherwise, which is too long). Exact string per the brand
      // spec — ampersand and period included.
      { name: "apple-mobile-web-app-title", content: "Kya & Co." },
      { title: i18next.t("root.metaTitle", "Kya & Co. — Calm, clear care for your bird") },
      { name: "description", content: i18next.t("root.metaDescription", "Shared care for your bird. Build one care plan, then share it so family, pet sitters, and household members all stay on the same page.") },
      { property: "og:site_name", content: "Kya & Co." },
      { property: "og:title", content: i18next.t("root.metaTitle", "Kya & Co. — Calm, clear care for your bird") },
      { property: "og:description", content: i18next.t("root.metaDescription", "Shared care for your bird. Build one care plan, then share it so family, pet sitters, and household members all stay on the same page.") },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.thekyaproject.com/brand/lockups/horizontal-ink.png" },
      { name: "twitter:title", content: i18next.t("root.metaTitle", "Kya & Co. — Calm, clear care for your bird") },
      { name: "twitter:description", content: i18next.t("root.metaDescription", "Shared care for your bird. Build one care plan, then share it so family, pet sitters, and household members all stay on the same page.") },
      { name: "twitter:image", content: "https://app.thekyaproject.com/brand/lockups/horizontal-ink.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Setup screens: Newsreader for headings, DM Sans for everything else.
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Newsreader:opsz,wght@6..72,600;6..72,700&display=swap" },
      // Kya & Co. favicons — multi-size set delivered by the brand spec.
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  // iOS Safari's Smart App Banner on app screens (see appLinks.ts). Rendered
  // here rather than in head() because it carries the current URL, and Safari
  // reads it from the first page load, which is the server render.
  const location = useRouterState({ select: (s) => s.location });
  const banner = smartAppBannerContent(location.pathname, location.searchStr);
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {banner && <meta name="apple-itunes-app" content={banner} />}
      </head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

// TEMPORARY — error-capture verification (see src/lib/errorTest.ts).
function ThrowOnRender({ nonce }: { nonce: string }): never {
  const err = new Error(errorTestMessage("render"));
  err.name = `KyaErrorTestRender_${nonce}`;
  throw err;
}

async function runErrorTest(setRenderTest: (n: string) => void) {
  const params = new URLSearchParams(window.location.search);
  const kind = params.get("kya_error_test");
  const nonce = (params.get("n") ?? "").toLowerCase();
  if (!kind || !/^[a-z0-9]{4,12}$/.test(nonce)) return;
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id !== ERROR_TEST_ACCOUNT) return;
  const make = (k: string) => {
    const e = new Error(errorTestMessage(k));
    e.name = `KyaErrorTest${k[0].toUpperCase()}${k.slice(1)}_${nonce}`;
    return e;
  };
  if (kind === "client") setTimeout(() => { throw make("client"); }, 0);
  else if (kind === "unhandled") void Promise.reject(make("unhandled"));
  else if (kind === "render") setRenderTest(nonce);
  else if (kind === "server" || kind === "burst") {
    const times = kind === "burst" ? 11 : 1;
    for (let i = 0; i < times; i++) {
      try { await fireServerErrorTest({ data: { nonce } }); } catch { /* expected */ }
    }
  }
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [renderTest, setRenderTest] = useState<string | null>(null); // TEMPORARY
  // A code file failed to load and the one automatic reload is already spent:
  // show the error screen instead of reloading again (sw-register.ts).
  const [startupFailed, setStartupFailed] = useState(false);
  useEffect(() => {
    const onFailed = () => setStartupFailed(true);
    window.addEventListener(STARTUP_FAILED_EVENT, onFailed);
    markAppHealthySoon();
    return () => window.removeEventListener(STARTUP_FAILED_EVENT, onFailed);
  }, []);
  useEffect(() => { void runErrorTest(setRenderTest); }, []); // TEMPORARY

  useEffect(() => {
    // Error reporting first, so anything that throws during the rest of boot is
    // caught. Reports queue until PostHog has loaded (analytics.ts).
    registerErrorReportingContext({ router, queryClient });
    installErrorListeners();
    captureFirstTouch(); // first-touch attribution — record source before signup
    if (window.location.hash.includes("access_token=")) {
      // Supabase's implicit auth flow lands with live tokens in the URL hash.
      // Let supabase-js consume them (getSession resolves after URL detection),
      // scrub whatever remains, and only then boot analytics so PostHog never
      // observes the token URL.
      supabase.auth.getSession().finally(() => {
        if (window.location.hash.includes("access_token=")) {
          window.history.replaceState(
            window.history.state,
            "",
            window.location.pathname + window.location.search,
          );
        }
        initAnalytics();
      });
    } else {
      initAnalytics();
    }
    installChunkErrorRecovery(); // self-heal stale-build chunk 404s (incl. the sitter preview iframe)
    registerServiceWorker();
    // Native shell only: make a tapped push land on the screen it refers to.
    // Attached once at boot because the tap can happen while the app is cold —
    // Capacitor replays the event after launch, so a listener attached later
    // (e.g. only on the settings screen) would miss it entirely.
    void attachNativePushHandlers((url: string) => router.navigate({ href: url } as never));
    // Native shell only: a tapped email or web link that opened the app (see
    // appLinks.ts) lands on its screen. Attached at boot for the same reason.
    void attachAppLinkHandler((href: string) => router.navigate({ href } as never));
    // Native shell only: keep the server's device token current (see
    // syncNativePushToken). Needs a session, since the row is per account.
    const syncPushToken = () =>
      void syncNativePushToken((token, transport) => savePushToken({ data: { token, transport } }));
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.id) {
        identifyUser(data.session.user.id);
        void primeAccountRole(data.session.user.id);
        void ensureProfileLocale(data.session.user.id);
        syncPushToken();
      } else {
        // Signed out (sign-in, invite and handoff pages): follow the browser.
        applyOwnerLocale(null);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") {
        resetUser();
        void primeAccountRole(null);
        applyOwnerLocale(null);
      } else if (session?.user?.id) {
        identifyUser(session.user.id);
        void primeAccountRole(session.user.id);
        void ensureProfileLocale(session.user.id);
        if (event === "SIGNED_IN") syncPushToken();
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    // App-wide default i18n instance, pinned to English. This establishes
    // react-i18next's instance for EVERY surface — including owner routes that
    // render shared components (CareSheetView, ConcernFlow, ScanForm, …) but
    // don't otherwise import the i18n module. Without it those components would
    // hit an uninitialized i18next and render raw keys. The sitter route nests
    // its own <I18nextProvider> to switch its subtree to Dutch; this stays en.
    <I18nextProvider i18n={globalI18n} defaultNS="translation">
      <QueryClientProvider client={queryClient}>
        {startupFailed ? <SomethingWentWrong /> : renderTest ? <ThrowOnRender nonce={renderTest} /> : <Outlet />}
        <Toaster />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
