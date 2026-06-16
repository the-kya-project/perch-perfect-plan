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
import { registerServiceWorker } from "@/lib/sw-register";

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
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
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
      { name: "theme-color", content: "#2d5754" },
      { title: "Parrot Care Co-Pilot — by The Kya Project" },
      { name: "description", content: "Build a clear care plan for your parrot and help your sitter keep them safe — including a daily health scan and emergency mode." },
      { property: "og:title", content: "Parrot Care Co-Pilot — by The Kya Project" },
      { property: "og:description", content: "Build a clear care plan for your parrot and help your sitter keep them safe — including a daily health scan and emergency mode." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/__l5e/assets-v1/9ff5e2dc-f264-49a0-8d38-75b4993798df/kya_appicon_tile_512.png" },
      { name: "twitter:title", content: "Parrot Care Co-Pilot — by The Kya Project" },
      { name: "twitter:description", content: "Build a clear care plan for your parrot and help your sitter keep them safe — including a daily health scan and emergency mode." },
      { name: "twitter:image", content: "/__l5e/assets-v1/9ff5e2dc-f264-49a0-8d38-75b4993798df/kya_appicon_tile_512.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/__l5e/assets-v1/9ff5e2dc-f264-49a0-8d38-75b4993798df/kya_appicon_tile_512.png" },
      { rel: "apple-touch-icon", href: "/__l5e/assets-v1/9ff5e2dc-f264-49a0-8d38-75b4993798df/kya_appicon_tile_512.png" },
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
    initAnalytics();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) identifyUser(data.user.id);
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
