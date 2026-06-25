// Deploy target: Vercel.
// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// The app never uses Supabase Realtime (no channels/subscriptions), but
// supabase-js always bundles realtime-js + phoenix (~54KB minified) on every
// screen. Alias it to a no-op stub to drop that weight. See the stub file for
// why this is safe (auth refresh is independent of realtime).
const realtimeStub = fileURLToPath(
  new URL("./src/integrations/supabase/realtime-stub.ts", import.meta.url),
);

// Surface the package.json version to the app (shown on the Account screen) so
// there's a single source of truth rather than a hardcoded string in the UI.
const pkgVersion = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
).version as string;

export default defineConfig({
  nitro: { preset: "vercel" },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion),
    },
    resolve: {
      alias: [
        { find: /^@supabase\/realtime-js$/, replacement: realtimeStub },
      ],
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null, // our guarded wrapper is the only registrar
        filename: "sw.js",
        // The manifest is hand-maintained at public/manifest.webmanifest — don't generate one.
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
          // New SW takes over on the next page load instead of waiting for every
          // controlled PWA window to close — without this, fixes can sit stuck
          // behind the old SW for days on iOS where the user never fully quits.
          skipWaiting: true,
          clientsClaim: true,
          // Serve the app shell network-first so updates land without forcing reloads.
          navigateFallback: "/",
          navigateFallbackDenylist: [
            /^\/__/,        // Lovable infra & asset URLs
            /^\/api\//,     // server routes
            /^\/~oauth/,    // OAuth callback
            /^\/sitter\//,  // sitter pages must always hit network for fresh data
          ],
          // Don't precache big media; let runtime caching handle on demand.
          globPatterns: ["**/*.{js,css,html,svg,ico,woff2}"],
          runtimeCaching: [
            {
              // Sitter pages (including the owner's preview iframe, which the
              // active SW still controls) must always boot from the live build —
              // never a cached shell that could reference purged JS chunks. This
              // must come before the generic navigate rule below to win the match.
              urlPattern: ({ url, request }) => request.mode === "navigate" && url.pathname.startsWith("/sitter/"),
              handler: "NetworkOnly",
            },
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "html-shell", networkTimeoutSeconds: 4 },
            },
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/__l5e/assets-v1/"),
              handler: "CacheFirst",
              options: {
                cacheName: "lovable-cdn-assets",
                expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
            {
              urlPattern: ({ request, sameOrigin }) =>
                sameOrigin && ["style", "script", "worker", "font"].includes(request.destination),
              handler: "CacheFirst",
              options: { cacheName: "static-assets" },
            },
          ],
        },
      }),
    ],
  },
});
