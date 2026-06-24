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

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { initAnalytics, identifyUser, resetUser } from "@/lib/analytics";
import { registerServiceWorker, installChunkErrorRecovery, hardResetAndReload } from "@/lib/sw-register";
import { captureFirstTouch } from "@/lib/attribution";

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
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
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
      { name: "description", content: "Calm, clear care for your bird — even when you can't be there." },
      { property: "og:site_name", content: "Kya & Co." },
      { property: "og:title", content: "Kya & Co. — Calm, clear care for your bird" },
      { property: "og:description", content: "Everything they need, everything you've learned, everything the people helping should know." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://app.thekyaproject.com/brand/lockups/stacked-ink.png" },
      { name: "twitter:title", content: "Kya & Co. — Calm, clear care for your bird" },
      { name: "twitter:description", content: "Everything they need, everything you've learned, everything the people helping should know." },
      { name: "twitter:image", content: "https://app.thekyaproject.com/brand/lockups/stacked-ink.png" },
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
    initAnalytics();
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
