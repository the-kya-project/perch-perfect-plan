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
import { startTransition, useEffect, useState, type ReactNode } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import { Loader2 } from "lucide-react";
import { globalI18n, hydrationI18n } from "@/lib/i18n";
import { StartupSplash } from "@/components/StartupSplash";
import { K, KyaPrimaryButton } from "@/components/kya";
import { FrontDoorBody, FrontDoorHeader, FrontDoorPage } from "@/components/frontDoor";

// The app's styles are inlined into every page, not linked as a file. On
// 2026-10-21 the installed iOS app received pages naming a stylesheet
// (/assets/styles-k2-B5IZw7cm.css) that the server answered with "not found",
// so it ran with no styles at all (reported by stylesCheck.ts). Inline styles
// arrive with the page itself and can't go missing.
import appCss from "../styles.css?inline";
import { installErrorListeners, primeAccountRole, registerErrorReportingContext, reportError } from "@/lib/errorReporting";
import { SUPPORT_EMAIL } from "@/lib/support";
import { ERROR_TEST_ACCOUNT, ERROR_TEST_INITIAL_SEARCH, errorTestMessage } from "@/lib/errorTest"; // TEMPORARY
import { toast } from "sonner"; // TEMPORARY
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
import { checkStylesApplied } from "@/lib/stylesCheck";
import { attachNativePushHandlers, syncNativePushToken } from "@/lib/pushNative";
import { attachAppLinkHandler } from "@/lib/appLinkNative";
import { smartAppBannerContent } from "@/lib/appLinks";
import { savePushToken } from "@/lib/push.functions";
// Side-effect import: registers the beforeinstallprompt/appinstalled listeners
// at app start so the native install prompt is captured (it fires once, early).

// The not-found and error screens use the front-door frame: a forest header
// with the logo, so the native status-bar strip stays forest with a white clock.

function NotFoundComponent() {
  const { t } = useTranslation();
  return (
    <FrontDoorPage>
      <FrontDoorHeader
        title={t("root.notFoundTitle", "We couldn't find that page")}
        line={t("root.notFoundLine", "The link may be old or mistyped.")}
      />
      <FrontDoorBody>
        {/* "/" sends a signed-in owner straight on to Home. */}
        <Link
          to="/"
          className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700]"
          style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
        >
          {t("root.goToKya", "Go to Kya & Co.")}
        </Link>
      </FrontDoorBody>
    </FrontDoorPage>
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
      <StartupSplash />
    );
  }
  return <SomethingWentWrong />;
}

/** The error screen: "Something went wrong", a Try again button that clears
 *  the service worker and caches before loading fresh, and Email us. The raw
 *  error message is deliberately NOT shown: it means nothing to the person
 *  reading it and can quote data back. It goes to the error report. */
function SomethingWentWrong() {
  const { t } = useTranslation();
  return (
    <FrontDoorPage>
      <FrontDoorHeader
        title={t("root.somethingWentWrong", "Something went wrong")}
        line={t("root.errorLine", "It's not you. Try again, and if it keeps happening, let us know.")}
      />
      <FrontDoorBody className="gap-3">
        <KyaPrimaryButton onClick={() => { void hardResetAndReload(); }}>
          {t("root.tryAgain", "Try again")}
        </KyaPrimaryButton>
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border-2 bg-white px-4 text-[15px] font-[700] active:scale-[0.99]"
          style={{ borderColor: K.forest, color: K.forest }}
        >
          {t("root.emailUs", "Email us")}
        </a>
      </FrontDoorBody>
    </FrontDoorPage>
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

// Startup safety net, inline in <head> so it works even when the app's own
// code never loads (a page whose scripts 404 can't run anything from the
// bundle, which is why the bundle-side recovery in sw-register.ts didn't help
// the 2026-10-21 stuck installs). Two jobs, no dependencies:
//  1. A code or style file of this page fails to load → ONE automatic hard
//     reset (unregister the worker, clear caches, reload). The attempt is
//     shared with sw-register.ts through the same "kya-auto-reload" record,
//     so the two together still reload at most once; after that, or offline,
//     it shows the screen below instead.
//  2. The app hasn't finished starting after 10 seconds → "Something's taking
//     too long" with a Try again button. Never an automatic reload.
// Leaving the page doesn't count as a failure: when a navigation starts
// (a tapped link, a redirect), Safari cancels the page's pending file loads
// and reports each as an error. Reloading then would replace the page the
// person asked for, so from beforeunload/pagehide until the page is shown
// again, load errors are ignored here and in sw-register.ts
// (window.__kyaLeaving).
// The app sets window.__kyaReady once the first screen has loaded (see
// RootComponent), which also removes the screen if it's showing.
const STARTUP_GUARD = `(function(){try{` +
  `var K="kya-auto-reload",W=300000,shown=false,leaving=false;` +
  `addEventListener("beforeunload",function(){leaving=true});addEventListener("pagehide",function(){leaving=true});` +
  `addEventListener("pageshow",function(){leaving=false});window.__kyaLeaving=function(){return leaving};` +
  `function nl(){try{return /^nl/i.test(navigator.language||"")}catch(e){return false}}` +
  `function reset(){var done=function(){try{var u=new URL(location.href);u.searchParams.set("_r",String(Date.now()));location.replace(u.toString())}catch(e){location.reload()}};` +
  `var p=[];try{if(navigator.serviceWorker)p.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}))}catch(e){}` +
  `try{if(window.caches)p.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k)}))}))}catch(e){}` +
  `Promise.all(p).then(done,done);setTimeout(done,3000)}` +
  `function show(){if(shown||window.__kyaReady||!document.body)return;shown=true;var d=document.createElement("div");d.id="kya-startup-slow";d.setAttribute("role","alert");` +
  `d.style.cssText="position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;background:#1a3d2e;color:#fff;font-family:'DM Sans',system-ui,-apple-system,sans-serif;padding:calc(env(safe-area-inset-top) + 24px) 28px calc(env(safe-area-inset-bottom) + 24px)";` +
  `var h=document.createElement("h1");h.textContent=nl()?"Dit duurt te lang":"Something's taking too long";h.style.cssText="margin:0;font:700 28px/1.2 Newsreader,Georgia,serif";` +
  `var t=document.createElement("p");t.textContent=nl()?"Controleer je verbinding en probeer het opnieuw.":"Check your connection, then try again.";t.style.cssText="margin:0;max-width:30ch;font-size:15px;line-height:1.5;color:#d6e8dc";` +
  `var b=document.createElement("button");b.type="button";b.textContent=nl()?"Opnieuw proberen":"Try again";b.style.cssText="margin-top:12px;min-height:52px;padding:0 32px;border-radius:999px;border:2px solid #1a3d2e;background:#f2b33d;color:#1a3d2e;font:700 16px 'DM Sans',system-ui,sans-serif";` +
  `b.onclick=function(){b.disabled=true;reset()};d.appendChild(h);d.appendChild(t);d.appendChild(b);document.body.appendChild(d)}` +
  `window.__kyaHideStartupGuard=function(){var d=document.getElementById("kya-startup-slow");if(d)d.remove()};` +
  `setTimeout(function(){if(!window.__kyaReady){if(document.body)show();else addEventListener("DOMContentLoaded",show)}},10000);` +
  `addEventListener("error",function(e){if(leaving)return;var el=e&&e.target;if(!el||(el.tagName!=="SCRIPT"&&el.tagName!=="LINK"))return;` +
  `var u=el.src||el.href||"";if(u.indexOf(location.origin+"/assets/")!==0||window.__kyaReady)return;` +
  `var at=0;try{at=Number(localStorage.getItem(K))||0}catch(x){}` +
  `if(navigator.onLine!==false&&!(Date.now()-at<W)){try{localStorage.setItem(K,String(Date.now()));reset();return}catch(x){}}` +
  `if(document.body)show();else addEventListener("DOMContentLoaded",show)},true);` +
  `}catch(e){}})();`;

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    scripts: [{ children: STARTUP_GUARD }, { children: COLD_LAUNCH_REDIRECT }],
    styles: [{ children: appCss }],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      // iOS Safari otherwise rewrites text that looks like a phone number, date,
      // email or address into links before React hydrates, so the page no longer
      // matches the server HTML (React #418).
      { name: "format-detection", content: "telephone=no, date=no, email=no, address=no" },
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
      // Newsreader for headings, DM Sans for everything else. SELF-HOSTED
      // (public/fonts): never link fonts.googleapis.com — it sends every
      // visitor's IP to Google (GDPR). `npm run check:no-google-fonts` fails
      // the build if a Google Fonts link comes back.
      { rel: "stylesheet", href: "/fonts/fonts.css" },
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
  const params = new URLSearchParams(ERROR_TEST_INITIAL_SEARCH);
  const kind = params.get("kya_error_test");
  const nonce = (params.get("n") ?? "").toLowerCase();
  if (!kind || !/^[a-z0-9]{4,12}$/.test(nonce)) return;
  const { data } = await supabase.auth.getSession();
  if (data.session?.user?.id !== ERROR_TEST_ACCOUNT) return;
  toast(`Error test "${kind}" fired`);
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
  // Tell the startup safety net (STARTUP_GUARD) the first screen has loaded:
  // the router has finished its first load, including the session check.
  useEffect(() => {
    const ready = () => {
      const w = window as unknown as { __kyaReady?: boolean; __kyaHideStartupGuard?: () => void };
      w.__kyaReady = true;
      w.__kyaHideStartupGuard?.();
    };
    if (router.state.status === "idle" && !router.state.isLoading) ready();
    return router.subscribe("onResolved", ready);
  }, [router]);
  useEffect(() => { void runErrorTest(setRenderTest); }, []); // TEMPORARY
  // English (hydrationI18n) for the server render and hydration, then the live
  // instance, which follows the owner's language. See hydrationI18n in
  // lib/i18n/i18n.ts: switching language while a route was still hydrating is
  // what made Dutch phones hit React #418/#422 on /, /auth and /confirm-email.
  // A transition, so React finishes hydrating every pending subtree with the
  // English it was server-rendered in before applying the switch.
  const [i18n, setI18n] = useState(() => hydrationI18n);
  useEffect(() => { startTransition(() => setI18n(globalI18n)); }, []);

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
    checkStylesApplied(); // report + one reset if the stylesheet never applied
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
    // App-wide i18n instance (hydrationI18n until hydrated, then globalI18n).
    // This establishes react-i18next's instance for EVERY surface — including
    // owner routes that render shared components (CareSheetView, ConcernFlow,
    // ScanForm, …) but don't otherwise import the i18n module. Without it those
    // components would hit an uninitialized i18next and render raw keys. The
    // sitter route nests its own <I18nextProvider> for its own language.
    <I18nextProvider i18n={i18n} defaultNS="translation">
      <QueryClientProvider client={queryClient}>
        {startupFailed ? <SomethingWentWrong /> : renderTest ? <ThrowOnRender nonce={renderTest} /> : <Outlet />}
        <Toaster />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
