import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { initAnalytics, identifyUser, resetUser } from "@/lib/analytics";
import {
  registerServiceWorker, installChunkErrorRecovery, hardResetAndReload,
  isStaleChunkError, chunkReloadAttemptedRecently, reloadForStaleChunk,
} from "@/lib/sw-register";
import { captureFirstTouch } from "@/lib/attribution";
// Side-effect import: registers the beforeinstallprompt/appinstalled listeners
// at app start so the native install prompt is captured (it fires once, early).
import "@/lib/pwaInstall";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-6xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or the sitter link is invalid.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  // A stale-build chunk 404 (lazy route import after a deploy swapped the
  // precache) is SELF-HEALING: installChunkErrorRecovery reloads onto the fresh
  // build within ~1s. Rendering the error screen for that window reads as "the
  // app broke" — show a calm loader instead and trigger the reload ourselves
  // (belt-and-braces with the vite:preloadError listener). Only if a recovery
  // reload was ALREADY attempted moments ago (loop guard) do we fall through to
  // the real error screen, so a genuinely broken build still surfaces.
  const recovering = isStaleChunkError(error) && !chunkReloadAttemptedRecently();
  useEffect(() => {
    if (recovering) reloadForStaleChunk();
    else reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error, recovering]);
  if (recovering) {
    return (
      <div className="grid min-h-screen place-items-center bg-[var(--cream)]" aria-hidden>
        <Loader2 className="size-5 animate-spin text-[var(--moss)]" />
      </div>
    );
  }
  const detail = error.message && !/unknown error/i.test(error.message) ? error.message : null;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is usually an out-of-date copy of the app cached on this device. Reloading
          it pulls the latest version and normally fixes it.
        </p>
        {detail && <p className="mt-2 text-xs text-muted-foreground/80">{detail}</p>}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { void hardResetAndReload(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Reload the app
          </button>
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium"
          >
            Try again
          </button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium">Go home</a>
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
      { title: "Kya & Co. — Calm, clear care for your bird" },
      { name: "description", content: "Shared care for your bird. Build one care plan, then share it so family, pet sitters, and household members all stay on the same page." },
      { property: "og:site_name", content: "Kya & Co." },
      { property: "og:title", content: "Kya & Co. — Calm, clear care for your bird" },
      { property: "og:description", content: "Shared care for your bird. Build one care plan, then share it so family, pet sitters, and household members all stay on the same page." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.thekyaproject.com/brand/lockups/horizontal-ink.png" },
      { name: "twitter:title", content: "Kya & Co. — Calm, clear care for your bird" },
      { name: "twitter:description", content: "Shared care for your bird. Build one care plan, then share it so family, pet sitters, and household members all stay on the same page." },
      { name: "twitter:image", content: "https://app.thekyaproject.com/brand/lockups/horizontal-ink.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
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
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
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
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.id) identifyUser(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") resetUser();
      else if (session?.user?.id) identifyUser(session.user.id);
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster />
    </QueryClientProvider>
  );
}
