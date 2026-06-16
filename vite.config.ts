// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null, // our guarded wrapper is the only registrar
        filename: "sw.js",
        // The manifest is hand-maintained at public/manifest.webmanifest — don't generate one.
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
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
