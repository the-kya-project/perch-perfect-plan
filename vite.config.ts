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
import { PRODUCTION_SUPABASE_REF, resolvePreviewSupabase } from "./src/lib/supabaseEnv";

// Vercel previews talk to a Supabase branch (the PR's own, or staging), never
// production. resolvePreviewSupabase throws -- failing the build -- when the
// preview's settings are missing or point at production. The resolved values
// are written to the VITE_ names the client reads, which Vite picks up from
// process.env after this file runs. Production and local builds skip all of
// this and read their variables exactly as before. See src/lib/supabaseEnv.ts.
const previewSupabase =
  process.env.VERCEL_ENV === "preview" ? resolvePreviewSupabase(process.env) : null;
if (previewSupabase) {
  process.env.VITE_SUPABASE_URL = previewSupabase.url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = previewSupabase.publishableKey;
  process.env.VITE_SUPABASE_PROJECT_ID = previewSupabase.ref;
  console.log(`[supabase] preview build uses Supabase project ${previewSupabase.ref}`);
}

// Previews must not reach production's outside services either. PostHog is
// off in code for every non-production build (src/lib/deployEnv.ts) and Brevo
// refuses to send in a preview even if a key reappears; the rest are simply
// absent from Vercel's Preview scope. This line reports what the build saw.
const DEPLOY_ENV =
  process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview"
    ? process.env.VERCEL_ENV
    : "development";
// Clip uploads need Cloudflare Stream credentials; without them in a preview the
// recorder says so up front instead of failing after a recording.
const CLIPS_AVAILABLE =
  DEPLOY_ENV !== "preview" ||
  Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_TOKEN);
if (DEPLOY_ENV === "preview") {
  const has = (k: string) => (process.env[k] ? "present" : "absent");
  console.log(
    `[preview] third-party services: posthog=off brevo=off (BREVO_API_KEY ${has("BREVO_API_KEY")}) ` +
      `clips=${CLIPS_AVAILABLE ? "on" : "off"} push=${process.env.VAPID_PUBLIC_KEY ? "on" : "off"} ` +
      `sourcemap-upload=off cron-secret=${has("CARE_PLAN_REMINDER_SECRET")}`,
  );
}

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
const SUPABASE_ORIGIN = previewSupabase
  ? new URL(previewSupabase.url).origin
  : `https://${PRODUCTION_SUPABASE_REF}.supabase.co`;
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
  // us-assets.i.posthog.com serves PostHog's post-init scripts (config.js,
  // surveys.js) — observed live once analytics actually initialized.
  "script-src 'self' 'unsafe-inline' https://us.i.posthog.com https://eu.i.posthog.com https://us-assets.i.posthog.com https://plausible.io",
  // If a host turns up in the `[csp-report]` logs, add it BEFORE flipping the
  // policy to enforce — that is what the observation window is for.
  `connect-src 'self' ${SUPABASE_ORIGIN} https://*.videodelivery.net https://*.cloudflarestream.com https://us.i.posthog.com https://eu.i.posthog.com https://us-assets.i.posthog.com https://plausible.io`,
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
      // Self-hosted brand fonts are linked from emails, i.e. cross-origin, and
      // browsers (WebKit in Apple Mail included) require CORS for web fonts.
      "/fonts/**": { headers: { "access-control-allow-origin": "*" } },
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
      __KYA_DEPLOY_ENV__: JSON.stringify(DEPLOY_ENV),
      __KYA_CLIPS_AVAILABLE__: JSON.stringify(CLIPS_AVAILABLE),
    },
    // Source maps are generated for PostHog error tracking ONLY: the build step
    // (scripts/sourcemaps.mjs) uploads them, then deletes every .map file and
    // strips the sourceMappingURL comments before deploy, and fails the build
    // if any survive. They are never served.
    build: {
      sourcemap: true,
      // "k2" is a one-time rename of every code file. On 2026-10-21 the iOS
      // app looped on startup because the phone kept serving a bad cached
      // copy of a code file under its old name; new names mean no device
      // ever asks its cache for those URLs again. Bump it only to force the
      // same clean slate after a similar incident.
      rollupOptions: {
        output: {
          entryFileNames: "assets/[name]-k2-[hash].js",
          chunkFileNames: "assets/[name]-k2-[hash].js",
          assetFileNames: "assets/[name]-k2-[hash][extname]",
        },
      },
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
          // anything not matched here on demand. Stylesheets are left out on
          // purpose: they load straight from the network (see src/sw.ts).
          globPatterns: ["**/*.{js,html,svg,ico,woff2}"],
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
