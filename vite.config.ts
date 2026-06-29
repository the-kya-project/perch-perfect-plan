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

// Baseline security headers. Applied via Nitro routeRules (NOT vercel.json):
// this app deploys through Nitro's Vercel Build Output API (.vercel/output/
// config.json), which is authoritative — a root vercel.json headers block is
// ignored. routeRules headers are written into that config and actually ship.
//
// CSP is built from the app's REAL client origins:
//   - Supabase (koyqdyamazuuwvqbttnj.supabase.co): REST/auth/storage/edge fns
//     → connect-src; signed storage images → img-src; legacy signed clips → media-src
//   - Cloudflare Stream (*.videodelivery.net / *.cloudflarestream.com): playback
//     iframe → frame-src; tus upload → connect-src; segments → media-src
//   - images.weserv.nl: Webflow blog image proxy → img-src
//   - PostHog / Plausible: optional analytics (script + events) → script-src + connect-src
//   - data:/blob: local previews + legacy base64 photos; 'self' for everything else
// script-src/style-src keep 'unsafe-inline' because TanStack Start injects inline
// hydration scripts and the UI uses inline styles, and static headers can't carry
// a per-request nonce. The disproportionate protection is the tight connect-src,
// which blocks exfiltrating the localStorage Supabase session to an attacker host.
//
// Shipped as Content-Security-Policy-REPORT-ONLY first (per the guardrail): verify
// the real flows (Google sign-in, photo upload, Cloudflare playback, waitlist) show
// no console CSP violations, then rename the header to Content-Security-Policy to
// enforce. The other headers are enforced immediately (no breakage risk).
const SUPABASE_ORIGIN = "https://koyqdyamazuuwvqbttnj.supabase.co";
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
  "script-src 'self' 'unsafe-inline' https://us.i.posthog.com https://eu.i.posthog.com https://plausible.io",
  `connect-src 'self' ${SUPABASE_ORIGIN} https://*.videodelivery.net https://*.cloudflarestream.com https://us.i.posthog.com https://eu.i.posthog.com https://plausible.io`,
  "frame-src 'self' https://*.videodelivery.net",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Same-origin framing only (the owner "View as sitter" iframe is same-origin).
  "X-Frame-Options": "SAMEORIGIN",
  // Camera + mic are used for photos/clips; geolocation is not. Lock the rest down.
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(), browsing-topics=()",
  // Report-only until verified on a deploy — then rename to Content-Security-Policy.
  "Content-Security-Policy-Report-Only": CSP,
};

export default defineConfig({
  nitro: {
    preset: "vercel",
    // routeRules is valid Nitro config (the build writes these headers into
    // .vercel/output/config.json) but the wrapper's nitro type is narrower — cast.
    routeRules: { "/**": { headers: SECURITY_HEADERS } },
  } as any,
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
    // NOTE: VitePWA (Workbox generateSW) was removed. Under TanStack Start +
    // Nitro + Vercel it emitted to dist/sw.js but Vercel serves
    // .vercel/output/static/ (where public/sw.js lands), so the generated SW
    // never shipped and warned "precache 0 entries". The single shipping SW is
    // now the hand-authored public/sw.js (push + app-shell caching + offline).
    plugins: [],
  },
});
