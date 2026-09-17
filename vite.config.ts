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

// Baseline security headers, applied via Nitro routeRules (written into
// .vercel/output/config.json — a root vercel.json headers block is ignored by
// this build). CSP ships REPORT-ONLY first: it observes and reports violations
// but never blocks, so we can verify the real flows before flipping to enforce.
const SUPABASE_ORIGIN = "https://koyqdyamazuuwvqbttnj.supabase.co";
// Same-origin, and under /api/public/* so it bypasses the published-site auth.
const CSP_REPORT_PATH = "/api/public/csp-report";
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  `form-action 'self' ${SUPABASE_ORIGIN}`,
  `img-src 'self' data: blob: ${SUPABASE_ORIGIN} https://images.weserv.nl`,
  `media-src 'self' blob: ${SUPABASE_ORIGIN} https://*.videodelivery.net https://*.cloudflarestream.com`,
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  // analytics.tiktok.com: ads pixel on the marketing pages (src/lib/tiktokPixel.ts);
  // the -sg host is TikTok's regional fallback for the same script/beacons.
  // us-assets.i.posthog.com serves PostHog's post-init scripts (config.js,
  // surveys.js) — observed live once analytics actually initialized.
  "script-src 'self' 'unsafe-inline' https://us.i.posthog.com https://eu.i.posthog.com https://us-assets.i.posthog.com https://plausible.io https://analytics.tiktok.com https://analytics-sg.tiktok.com",
  `connect-src 'self' ${SUPABASE_ORIGIN} https://*.videodelivery.net https://*.cloudflarestream.com https://us.i.posthog.com https://eu.i.posthog.com https://us-assets.i.posthog.com https://plausible.io https://analytics.tiktok.com https://analytics-sg.tiktok.com`,
  "frame-src 'self' https://*.videodelivery.net",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  // Without one of these the report-only policy did nothing at all: it blocked
  // nothing by definition and had nowhere to report to. `report-uri` is
  // deprecated but still the only one Safari and older Chrome honour;
  // `report-to` is the modern Reporting API form and needs the
  // Reporting-Endpoints header below. Both point at the same collector.
  `report-uri ${CSP_REPORT_PATH}`,
  "report-to csp-endpoint",
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Same-origin framing only (the owner "View as sitter" iframe is same-origin).
  "X-Frame-Options": "SAMEORIGIN",
  // Camera + mic are used for photos/clips; geolocation is not. Lock the rest down.
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), browsing-topics=()",
  // Report-only until verified on a deploy — then rename to Content-Security-Policy.
  // Do NOT flip that switch until the collector has seen a week of real traffic;
  // enforcing a policy nobody has observed is how you break production.
  "Content-Security-Policy-Report-Only": CSP,
  // Names the group that the CSP's `report-to csp-endpoint` refers to.
  "Reporting-Endpoints": `csp-endpoint="${CSP_REPORT_PATH}"`,
  // Vercel already sends max-age=63072000 on the custom domain, but without
  // includeSubDomains. Scoped to app.thekyaproject.com this only covers hosts
  // UNDER app.* (not the apex or www, which are a separate Webflow site), so it
  // is safe. `preload` is deliberately omitted: it is a one-way door — getting
  // back off the browser preload list takes months — and it would commit the
  // apex domain too, which is not ours to decide here.
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
};

export default defineConfig({
  nitro: {
    preset: "vercel",
    routeRules: {
      "/**": { headers: SECURITY_HEADERS },
      // PostHog reverse proxy: analytics flows through our own domain so ad
      // blockers that blanket-block *.posthog.com don't drop the data. A root
      // vercel.json rewrite would be ignored by this build (see above), so the
      // proxy lives here. Most-specific rule wins, so /ingest/static/** (SDK
      // assets) matches ahead of /ingest/** (event capture + config).
      "/ingest/static/**": { proxy: "https://us-assets.i.posthog.com/static/**" },
      "/ingest/**": { proxy: "https://us.i.posthog.com/**" },
    },
  } as any,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(pkgVersion),
      // Which web build is actually running. The native shells load the
      // production site remotely and a service worker can serve stale chunks,
      // so "was the fix live on that device?" is otherwise unanswerable after
      // the fact -- which is exactly the ambiguity that made an App Review
      // failure impossible to attribute. Vercel sets VERCEL_GIT_COMMIT_SHA.
      __WEB_BUILD__: JSON.stringify(
        (process.env.VERCEL_GIT_COMMIT_SHA ?? "local").slice(0, 7),
      ),
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
        // The worker is hand-written at src/sw.ts (caching + web push in one
        // file); the plugin bundles it to /sw.js and injects the precache
        // manifest. generateSW is off the table: its output filename collided
        // with the old public/sw.js push worker, which silently clobbered it
        // at build time and shipped production with no caching at all.
        strategies: "injectManifest",
        srcDir: "src",
        filename: "sw.ts",
        // The manifest is hand-maintained at public/manifest.webmanifest — don't generate one.
        manifest: false,
        devOptions: { enabled: false },
        injectManifest: {
          // The client build writes straight to .vercel/output/static (nitro
          // vercel preset), not the root outDir the plugin assumes — glob the
          // real output or the precache manifest comes out empty.
          globDirectory: ".vercel/output/static",
          // Don't precache big media; runtime caching in src/sw.ts picks up
          // anything not matched here on demand.
          globPatterns: ["**/*.{js,css,html,svg,ico,woff2}"],
        },
      }),
      // NOTE: the plugin emits the finished worker to dist/sw.js (the root
      // outDir), which Vercel never serves — and it injects the precache
      // manifest as the very last build step, after every plugin hook has
      // run. scripts/copy-sw.mjs (chained in the npm build script) moves it
      // into .vercel/output/static once the build is fully done.
    ],
  },
});
