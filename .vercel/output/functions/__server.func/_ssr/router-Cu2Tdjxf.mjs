import { b as QueryClient } from "../_libs/tanstack__query-core.mjs";
import { Q as QueryClientProvider, u as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { c as createRouter, a as createRootRouteWithContext, u as useRouter, L as Link, O as Outlet, H as HeadContent, S as Scripts, b as createFileRoute, l as lazyRouteComponent, d as useSearch } from "../_libs/tanstack__react-router.mjs";
import { S as retainSearchParams, T as redirect, m as isRedirect } from "../_libs/tanstack__router-core.mjs";
import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { supabase } from "./client-HgPYj8QJ.mjs";
import { T as Toaster$1 } from "../_libs/sonner.mjs";
import { c as createServerFn, T as TSS_SERVER_FUNCTION, g as getServerFnById } from "./server-9nIpN7MJ.mjs";
import { A as ArrowLeft, C as Check, a as ChevronDown } from "../_libs/lucide-react.mjs";
import { o as objectType, e as enumType, s as stringType, c as coerce, b as booleanType, r as recordType } from "../_libs/zod.mjs";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream";
import "../_libs/isbot.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
function useServerFn(serverFn) {
  const router2 = useRouter();
  return reactExports.useCallback(async (...args) => {
    try {
      const res = await serverFn(...args);
      if (isRedirect(res)) throw res;
      return res;
    } catch (err) {
      if (isRedirect(err)) {
        err.options._fromLocation = router2.stores.location.get();
        return router2.navigate(router2.resolveRedirect(err).options);
      }
      throw err;
    }
  }, [router2, serverFn]);
}
const appCss = "/assets/styles-CZsIxlnY.css";
function reportLovableError(error, context = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    error,
    {
      source: "react_error_boundary",
      route: window.location.pathname,
      ...context
    },
    {
      mechanism: "react_error_boundary",
      handled: false,
      severity: "error"
    }
  );
}
const Toaster = ({ ...props }) => {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(
    Toaster$1,
    {
      className: "toaster group",
      toastOptions: {
        classNames: {
          toast: "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground"
        }
      },
      ...props
    }
  );
};
const __vite_import_meta_env__ = {};
function readEnv() {
  const env = __vite_import_meta_env__ ?? {};
  const raw = String(env.VITE_ANALYTICS_PROVIDER ?? "").toLowerCase().trim();
  let provider = null;
  if (raw === "posthog" && env.VITE_POSTHOG_KEY) provider = "posthog";
  else if (raw === "plausible" && env.VITE_PLAUSIBLE_DOMAIN) provider = "plausible";
  else if (!raw) {
    if (env.VITE_POSTHOG_KEY) provider = "posthog";
    else if (env.VITE_PLAUSIBLE_DOMAIN) provider = "plausible";
  }
  return {
    provider,
    posthogKey: env.VITE_POSTHOG_KEY || void 0,
    posthogHost: env.VITE_POSTHOG_HOST || "https://us.i.posthog.com",
    plausibleDomain: env.VITE_PLAUSIBLE_DOMAIN || void 0,
    plausibleHost: env.VITE_PLAUSIBLE_HOST || "https://plausible.io"
  };
}
let booted = false;
let ready = false;
const queue = [];
function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}
function flush() {
  ready = true;
  while (queue.length) {
    const fn = queue.shift();
    try {
      fn?.();
    } catch {
    }
  }
}
async function sha256Hex(input) {
  if (!isBrowser() || !window.crypto?.subtle) return input;
  const buf = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function scrub(props) {
  if (!props) return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    const lk = k.toLowerCase();
    if (/email|name|token|note|message|address|phone|url|path|file/.test(lk)) continue;
    if (typeof v === "string" && v.length > 80) continue;
    out[k] = v;
  }
  return out;
}
function loadScript(src, attrs = {}) {
  return new Promise((resolve, reject) => {
    if (!isBrowser()) return resolve();
    const existing = document.querySelector(`script[data-analytics-src="${src}"]`);
    if (existing) return resolve();
    const s = document.createElement("script");
    s.async = true;
    s.defer = true;
    s.src = src;
    s.dataset.analyticsSrc = src;
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
async function bootPostHog(key, host) {
  if (!window.posthog) {
    (function(t, e) {
      const o = t.posthog = t.posthog || [];
      if (!o.__SV) {
        const a = e.createElement("script");
        a.type = "text/javascript";
        a.async = true;
        a.src = `${host}/static/array.js`;
        const n = e.getElementsByTagName("script")[0];
        n.parentNode.insertBefore(a, n);
        const c = "init capture identify alias people.set people.set_once register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys".split(" ");
        for (let r = 0; r < c.length; r++) {
          const fn = c[r];
          o[fn] = (...args) => o.push([fn, ...args]);
        }
        o.__SV = 1;
      }
    })(window, document);
  }
  window.posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    persistence: "localStorage+cookie",
    autocapture: false,
    disable_session_recording: true,
    respect_dnt: true,
    sanitize_properties: (p) => p
  });
  flush();
}
async function bootPlausible(domain, host) {
  window.plausible = window.plausible || function() {
    (window.plausible.q = window.plausible.q || []).push(arguments);
  };
  await loadScript(`${host}/js/script.js`, { "data-domain": domain });
  flush();
}
function initAnalytics() {
  if (booted || !isBrowser()) return;
  booted = true;
  const cfg = readEnv();
  if (!cfg.provider) {
    flush();
    return;
  }
  if (cfg.provider === "posthog" && cfg.posthogKey) {
    bootPostHog(cfg.posthogKey, cfg.posthogHost).catch(() => flush());
  } else if (cfg.provider === "plausible" && cfg.plausibleDomain) {
    bootPlausible(cfg.plausibleDomain, cfg.plausibleHost).catch(() => flush());
  }
}
function dispatch(name, props) {
  if (!isBrowser()) return;
  const cfg = readEnv();
  if (!cfg.provider) return;
  if (cfg.provider === "posthog") {
    const ph = window.posthog;
    if (ph?.capture) ph.capture(name, props);
  } else if (cfg.provider === "plausible") {
    const pl = window.plausible;
    if (typeof pl === "function") pl(name, { props });
  }
}
function track(name, props) {
  const safe = scrub(props);
  const send = () => dispatch(name, safe);
  if (ready) send();
  else queue.push(send);
}
async function identifyUser(userId) {
  if (!isBrowser() || !userId) return;
  const cfg = readEnv();
  if (cfg.provider !== "posthog") return;
  const hashed = await sha256Hex(`kya:${userId}`);
  const run = () => {
    const ph = window.posthog;
    if (ph?.identify) ph.identify(hashed);
  };
  if (ready) run();
  else queue.push(run);
}
function resetUser() {
  if (!isBrowser()) return;
  const ph = window.posthog;
  if (ph?.reset) ph.reset();
}
const SW_URL = "/sw.js";
function isPreviewHost(host) {
  return host.startsWith("id-preview--") || host.startsWith("preview--") || host === "lovableproject.com" || host.endsWith(".lovableproject.com") || host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com") || host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev");
}
async function unregisterAppWorkers() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const url = r.active?.scriptURL ?? r.installing?.scriptURL ?? r.waiting?.scriptURL ?? "";
      if (url.endsWith(SW_URL)) await r.unregister();
    }
  } catch {
  }
}
function registerServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const url = new URL(window.location.href);
  const refuse = inIframe || isPreviewHost(window.location.hostname) || url.searchParams.get("sw") === "off";
  if (refuse) {
    void unregisterAppWorkers();
    return;
  }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {
    });
  });
}
function NotFoundComponent() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-6xl font-bold text-foreground", children: "404" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "mt-4 text-xl font-semibold", children: "Page not found" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: "The page you're looking for doesn't exist or the sitter link is invalid." }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-6", children: /* @__PURE__ */ jsxRuntimeExports.jsx(
      Link,
      {
        to: "/",
        className: "inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
        children: "Go home"
      }
    ) })
  ] }) });
}
function ErrorComponent({ error, reset }) {
  console.error(error);
  const router2 = useRouter();
  reactExports.useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-h-screen items-center justify-center bg-background px-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "max-w-md text-center", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-xl font-semibold", children: "This page didn't load" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-muted-foreground", children: error.message }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-6 flex flex-wrap justify-center gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          onClick: () => {
            router2.invalidate();
            reset();
          },
          className: "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
          children: "Try again"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx("a", { href: "/", className: "rounded-md border border-input bg-background px-4 py-2 text-sm font-medium", children: "Go home" })
    ] })
  ] }) });
}
const Route$k = createRootRouteWithContext()({
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
      { name: "twitter:card", content: "summary_large_image" }
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/__l5e/assets-v1/9ff5e2dc-f264-49a0-8d38-75b4993798df/kya_appicon_tile_512.png" },
      { rel: "apple-touch-icon", href: "/__l5e/assets-v1/9ff5e2dc-f264-49a0-8d38-75b4993798df/kya_appicon_tile_512.png" },
      { rel: "manifest", href: "/manifest.webmanifest" }
    ]
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent
});
function RootShell({ children }) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("head", { children: /* @__PURE__ */ jsxRuntimeExports.jsx(HeadContent, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("body", { children: [
      children,
      /* @__PURE__ */ jsxRuntimeExports.jsx(Scripts, {})
    ] })
  ] });
}
function RootComponent() {
  const { queryClient } = Route$k.useRouteContext();
  const router2 = useRouter();
  reactExports.useEffect(() => {
    initAnalytics();
    registerServiceWorker();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.id) identifyUser(data.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      if (event === "SIGNED_OUT") resetUser();
      else if (session?.user?.id) identifyUser(session.user.id);
      router2.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router2, queryClient]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(QueryClientProvider, { client: queryClient, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Toaster, {})
  ] });
}
const $$splitComponentImporter$i = () => import("./terms-DotbywCZ.mjs");
const Route$j = createFileRoute("/terms")({
  head: () => ({
    meta: [{
      title: "Terms of Use — Parrot Care Co-Pilot"
    }, {
      name: "description",
      content: "Terms of use for Parrot Care Co-Pilot."
    }, {
      name: "robots",
      content: "noindex,nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$i, "component")
});
const $$splitComponentImporter$h = () => import("./reset-password-Dm9jiF7a.mjs");
const Route$i = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [{
      title: "Reset password — Parrot Care Co-Pilot"
    }, {
      name: "robots",
      content: "noindex,nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$h, "component")
});
const $$splitComponentImporter$g = () => import("./privacy-1aJxB0Ju.mjs");
const Route$h = createFileRoute("/privacy")({
  head: () => ({
    meta: [{
      title: "Privacy Policy — Parrot Care Co-Pilot"
    }, {
      name: "description",
      content: "How Parrot Care Co-Pilot handles your data."
    }, {
      name: "robots",
      content: "noindex,nofollow"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$g, "component")
});
const $$splitComponentImporter$f = () => import("./auth-D2jJjT3c.mjs");
const search = objectType({
  mode: enumType(["signin", "signup"]).default("signin")
});
const Route$g = createFileRoute("/auth")({
  validateSearch: search,
  head: () => ({
    meta: [{
      title: "Sign in — Parrot Care Co-Pilot"
    }, {
      name: "description",
      content: "Sign in or create an owner account to build a bird care plan."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$f, "component")
});
const $$splitComponentImporter$e = () => import("./route-BFsOu0JM.mjs");
const Route$f = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data,
      error
    } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: {
          mode: "signin"
        }
      });
    }
    return {
      user: data.user
    };
  },
  component: lazyRouteComponent($$splitComponentImporter$e, "component")
});
const $$splitComponentImporter$d = () => import("./index-DN-dD1jB.mjs");
const Route$e = createFileRoute("/")({
  head: () => ({
    meta: [{
      title: "Parrot Care Co-Pilot — by The Kya Project"
    }, {
      name: "description",
      content: "Owners build a complete bird care plan. Sitters open a secure link, follow the routine, run a daily health scan, and reach emergency help fast."
    }, {
      property: "og:title",
      content: "Parrot Care Co-Pilot — by The Kya Project"
    }, {
      property: "og:description",
      content: "Care plans, daily health scans, and emergency guidance for parrot sitters."
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$d, "component")
});
const $$splitComponentImporter$c = () => import("./notifications-BNram9yt.mjs");
const Route$d = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [{
      title: "Notifications — Parrot Care Co-Pilot"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$c, "component")
});
const $$splitComponentImporter$b = () => import("./dashboard-Sn8n3wIc.mjs");
const dashboardSearch = objectType({
  newSit: coerce.boolean().optional(),
  preselectBirdId: stringType().uuid().optional()
});
const Route$c = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [{
      title: "Your birds — Parrot Care Co-Pilot"
    }]
  }),
  validateSearch: dashboardSearch,
  component: lazyRouteComponent($$splitComponentImporter$b, "component")
});
const $$splitComponentImporter$a = () => import("./account-Bn_ZTZNg.mjs");
const Route$b = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [{
      title: "Account — Parrot Care Co-Pilot"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$a, "component")
});
var createSsrRpc = (functionId) => {
  const url = "/_serverFn/" + functionId;
  const serverFnMeta = { id: functionId };
  const fn = async (...args) => {
    return (await getServerFnById(functionId))(...args);
  };
  return Object.assign(fn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const getSitterContext = createServerFn({
  method: "GET"
}).inputValidator((d) => objectType({
  token: stringType().min(8),
  birdId: stringType().uuid().optional()
}).parse(d)).handler(createSsrRpc("50cb8f45f66e937d950971564c827d6b93feac9abf3e61bbc9b3d96c12ce922f"));
const toggleTaskCompletion = createServerFn({
  method: "POST"
}).inputValidator((d) => objectType({
  token: stringType().min(8),
  taskId: stringType().uuid(),
  completed: booleanType()
}).parse(d)).handler(createSsrRpc("df233a4b290a36bb9e590e32dfac9aae25c6873908fa14f6aa9c1760b8843e1b"));
const AnswerEnum = enumType(["normal", "not_sure", "concerning"]);
const submitHealthScan = createServerFn({
  method: "POST"
}).inputValidator((d) => objectType({
  token: stringType().min(8),
  birdId: stringType().uuid(),
  answers: recordType(stringType(), AnswerEnum),
  notes: stringType().max(2e3).optional()
}).parse(d)).handler(createSsrRpc("62e39282bef46fbf34bede070d2f06f18924ed0ea466fbc7ce31bb612a1b943a"));
const uploadDroppingsPhoto = createServerFn({
  method: "POST"
}).inputValidator((d) => objectType({
  token: stringType().min(8),
  birdId: stringType().uuid(),
  dataUrl: stringType().startsWith("data:image/").max(25e5),
  notes: stringType().max(1e3).optional()
}).parse(d)).handler(createSsrRpc("dc345fee44e99de68d1e2909355bedb00b78b877879c1ce3d16ec502e757ff98"));
const getGuideCards = createServerFn({
  method: "GET"
}).handler(createSsrRpc("8ce1c9c9a340fa1f4f599420438c639d99ad297758879e6c48d6681ae24abd15"));
const $$splitComponentImporter$9 = () => import("./route-BEQYk3UG.mjs");
const $$splitErrorComponentImporter = () => import("./route-CdAykAxC.mjs");
const searchSchema = objectType({
  birdId: stringType().uuid().optional()
});
const Route$a = createFileRoute("/sitter/$token")({
  ssr: false,
  validateSearch: searchSchema,
  search: {
    middlewares: [retainSearchParams(["birdId"])]
  },
  head: () => ({
    meta: [{
      title: "Sitter access — Parrot Care Co-Pilot"
    }, {
      name: "robots",
      content: "noindex,nofollow"
    }]
  }),
  errorComponent: lazyRouteComponent($$splitErrorComponentImporter, "errorComponent"),
  component: lazyRouteComponent($$splitComponentImporter$9, "component")
});
function useSitterContext(token) {
  const search2 = useSearch({
    from: "/sitter/$token"
  });
  const birdId = search2.birdId;
  const fn = useServerFn(getSitterContext);
  return useSuspenseQuery({
    queryKey: ["sitter-ctx", token, birdId ?? null],
    queryFn: () => fn({
      data: {
        token,
        birdId
      }
    })
  });
}
const $$splitComponentImporter$8 = () => import("./index-RWX2v1jp.mjs");
const Route$9 = createFileRoute("/sitter/$token/")({
  component: lazyRouteComponent($$splitComponentImporter$8, "component")
});
const $$splitComponentImporter$7 = () => import("./scan-DqiJNZpC.mjs");
const Route$8 = createFileRoute("/sitter/$token/scan")({
  component: lazyRouteComponent($$splitComponentImporter$7, "component")
});
const $$splitComponentImporter$6 = () => import("./guide-D01yRGna.mjs");
const Route$7 = createFileRoute("/sitter/$token/guide")({
  component: lazyRouteComponent($$splitComponentImporter$6, "component")
});
const $$splitComponentImporter$5 = () => import("./emergency-PADNKxW8.mjs");
const Route$6 = createFileRoute("/sitter/$token/emergency")({
  component: lazyRouteComponent($$splitComponentImporter$5, "component")
});
const $$splitComponentImporter$4 = () => import("./care-sheet-CxU1lPhy.mjs");
const Route$5 = createFileRoute("/sitter/$token/care-sheet")({
  component: lazyRouteComponent($$splitComponentImporter$4, "component")
});
const $$splitComponentImporter$3 = () => import("./new-CvDaE_oO.mjs");
const Route$4 = createFileRoute("/_authenticated/birds/new")({
  head: () => ({
    meta: [{
      title: "Add a bird — Parrot Care Co-Pilot"
    }]
  }),
  component: lazyRouteComponent($$splitComponentImporter$3, "component")
});
const $$splitComponentImporter$2 = () => import("../_birdId-BFsOu0JM.mjs");
const Route$3 = createFileRoute("/_authenticated/birds/$birdId")({
  component: lazyRouteComponent($$splitComponentImporter$2, "component")
});
const $$splitComponentImporter$1 = () => import("../_birdId.index-DTNAlD2z.mjs");
const TAB_IDS = ["basics", "routine", "food", "behavior", "home", "health", "clips", "emergency", "sits", "logs"];
const birdSearch = objectType({
  tab: enumType(TAB_IDS).optional()
});
const Route$2 = createFileRoute("/_authenticated/birds/$birdId/")({
  head: () => ({
    meta: [{
      title: "Care plan — Parrot Care Co-Pilot"
    }]
  }),
  validateSearch: birdSearch,
  component: lazyRouteComponent($$splitComponentImporter$1, "component")
});
const Route$1 = createFileRoute("/api/public/hooks/care-plan-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_ANON_KEY;
        if (!expected || apiKey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("./client.server-D5ro3rAQ.mjs");
        const { sendPushToOwner } = await import("./pushSender.server-DKbD_ZCz.mjs");
        const today = /* @__PURE__ */ new Date();
        const horizon = new Date(today);
        horizon.setUTCDate(horizon.getUTCDate() + 3);
        const { data: sits, error } = await supabaseAdmin.from("sits").select("id, start_date, sit_birds(bird_id, birds(name, owner_id, care_plans(updated_at)))").gte("start_date", today.toISOString().slice(0, 10)).lte("start_date", horizon.toISOString().slice(0, 10)).eq("revoked", false);
        if (error) {
          return Response.json({ ok: false, error: error.message }, { status: 500 });
        }
        const pushed = /* @__PURE__ */ new Set();
        let total = 0;
        for (const sit of sits ?? []) {
          const links = sit.sit_birds ?? [];
          for (const link of links) {
            const bird = link.birds;
            const ownerId = bird?.owner_id;
            if (!ownerId || pushed.has(`${ownerId}:${sit.id}`)) continue;
            pushed.add(`${ownerId}:${sit.id}`);
            const planUpdated = bird?.care_plans?.updated_at;
            const stale = !planUpdated || Date.now() - new Date(planUpdated).getTime() > 1e3 * 60 * 60 * 24 * 14;
            if (!stale) continue;
            const res = await sendPushToOwner(ownerId, "care_plan_reminder", {
              title: "Care plan check-in",
              body: `${bird?.name ?? "Your bird"} has a sit coming up — review the care plan?`,
              url: "/dashboard",
              tag: `care-plan-reminder-${sit.id}`
            });
            total += res.sent;
          }
        }
        return Response.json({ ok: true, sits: sits?.length ?? 0, pushed: total });
      }
    }
  }
});
const SETUP_STEPS = [
  { key: "basics", title: "The basics", short: "Basics" },
  { key: "day", title: "A day in the life", short: "Routine" },
  { key: "food", title: "Food & water", short: "Food" },
  { key: "personality", title: "Personality & handling", short: "Behavior" },
  { key: "environment", title: "Environment & safety", short: "Home" },
  { key: "health", title: "Health baseline", short: "Health" },
  { key: "clips", title: "Watch-first clips", short: "Clips" },
  { key: "emergency", title: "Emergency info", short: "Emergency" },
  { key: "review", title: "Review & finish", short: "Review" }
];
const TOTAL_STEPS = SETUP_STEPS.length;
function stepState(index, current) {
  if (index + 1 < current) return "completed";
  if (index + 1 === current) return "active";
  return "upcoming";
}
function SetupShell({
  step,
  title,
  subtitle,
  children,
  birdName,
  birdSpecies,
  onNavigateStep,
  onExit,
  isDirty,
  onBack,
  onNext,
  onSaveAndExit,
  nextLabel = "Next",
  nextDisabled,
  saving,
  backDisabled,
  hideFooter
}) {
  const [drawerOpen, setDrawerOpen] = reactExports.useState(false);
  const [confirmExit, setConfirmExit] = reactExports.useState(false);
  const completedCount = Math.max(0, step - 1);
  const pct = Math.round(completedCount / TOTAL_STEPS * 100);
  const current = SETUP_STEPS[step - 1];
  function handleExit() {
    if (!onExit) return;
    if (isDirty) setConfirmExit(true);
    else onExit();
  }
  function goToStep(target) {
    setDrawerOpen(false);
    onNavigateStep?.(target);
  }
  const birdLabel = birdName?.trim() || "Bird";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `min-h-screen bg-sage-50 ${hideFooter ? "pb-10" : "pb-32"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("header", { className: "sticky top-0 z-10 border-b border-sage-100 bg-white/95 backdrop-blur", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center gap-3 px-4 py-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: handleExit,
            disabled: !onExit,
            className: "-ml-1 flex items-center gap-1 rounded p-1 text-sm font-semibold text-sage-700 disabled:opacity-40",
            "aria-label": `Back to ${birdLabel}`,
            children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-5 shrink-0" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "max-w-[8rem] truncate", children: birdLabel })
            ]
          }
        ),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0 flex-1 text-right", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-sm font-semibold leading-tight text-sage-900", children: "Care plan setup" }),
          birdSpecies?.trim() && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-[11px] text-sage-600", children: birdSpecies })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "hidden md:block", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mx-auto max-w-md px-4 pb-2", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", children: SETUP_STEPS.map((s, i) => {
        const state = stepState(i, step);
        const base = "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs transition";
        const cls = state === "completed" ? "bg-sage-100 text-sage-700 hover:bg-sage-200" : state === "active" ? "bg-white font-medium text-sage-900 shadow-sm ring-1 ring-sage-300" : "bg-transparent text-sage-400 hover:text-sage-600";
        return /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => goToStep(i + 1),
            "aria-current": state === "active" ? "step" : void 0,
            className: `${base} ${cls}`,
            children: [
              state === "completed" ? /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-3.5" }) : state === "upcoming" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[10px] font-semibold", children: i + 1 }) : null,
              s.short
            ]
          },
          s.key
        );
      }) }) }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-stretch md:hidden", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex min-w-0 flex-1 items-center gap-3 px-4 py-2", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex shrink-0 items-center gap-1", "aria-hidden": "true", children: SETUP_STEPS.map((s, i) => {
            const state = stepState(i, step);
            return /* @__PURE__ */ jsxRuntimeExports.jsx(
              "span",
              {
                className: `h-1.5 rounded-full transition-all ${state === "active" ? "w-4 bg-sage-600" : state === "completed" ? "w-1.5 bg-sage-600" : "w-1.5 bg-sage-200"}`
              },
              s.key
            );
          }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-w-0", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "truncate text-sm font-medium leading-tight text-sage-900", children: current?.short }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[11px] leading-tight text-sage-600", children: [
              "Step ",
              step,
              " of ",
              TOTAL_STEPS
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(
          "button",
          {
            type: "button",
            onClick: () => setDrawerOpen(true),
            className: "flex shrink-0 items-center gap-1 border-l border-sage-100 px-4 text-xs font-semibold text-sage-700",
            children: [
              "All steps",
              /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: "size-4" })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-[3px] w-full bg-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full bg-sage-600 transition-all", style: { width: `${pct}%` } }) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-4 px-4 py-5", children: [
      subtitle && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-sage-600", children: subtitle }),
      children
    ] }),
    !hideFooter && /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { className: "fixed inset-x-0 bottom-0 z-20 border-t border-sage-100 bg-white/95 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center gap-2 px-4 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onBack,
          disabled: backDisabled || saving,
          "aria-label": "Previous step",
          className: "grid size-11 shrink-0 place-items-center rounded-xl border border-sage-200 bg-white text-sage-700 disabled:opacity-40",
          children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-5" })
        }
      ),
      onSaveAndExit && /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onSaveAndExit,
          disabled: saving,
          className: "shrink-0 px-2 text-xs font-semibold text-sage-700 underline disabled:opacity-50",
          children: "Save & exit"
        }
      ),
      /* @__PURE__ */ jsxRuntimeExports.jsx(
        "button",
        {
          type: "button",
          onClick: onNext,
          disabled: nextDisabled || saving,
          className: "flex-1 rounded-xl bg-sage-600 py-3 text-sm font-semibold text-white disabled:opacity-50",
          children: saving ? "Saving…" : nextLabel
        }
      )
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      "div",
      {
        className: `fixed inset-0 z-50 md:hidden ${drawerOpen ? "" : "pointer-events-none"}`,
        "aria-hidden": !drawerOpen,
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(
            "div",
            {
              onClick: () => setDrawerOpen(false),
              className: `absolute inset-0 bg-sage-900/40 transition-opacity ${drawerOpen ? "opacity-100" : "opacity-0"}`
            }
          ),
          /* @__PURE__ */ jsxRuntimeExports.jsxs(
            "div",
            {
              role: "dialog",
              "aria-label": "All steps",
              className: `absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-xl transition-transform duration-200 ${drawerOpen ? "translate-y-0" : "translate-y-full"}`,
              children: [
                /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex justify-center pt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "h-1 w-10 rounded-full bg-sage-200" }) }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "px-5 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-widest text-sage-600", children: "All steps" }),
                /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "max-h-[60vh] overflow-y-auto px-2 pb-2", children: SETUP_STEPS.map((s, i) => {
                  const state = stepState(i, step);
                  return /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: /* @__PURE__ */ jsxRuntimeExports.jsxs(
                    "button",
                    {
                      type: "button",
                      onClick: () => goToStep(i + 1),
                      className: "flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-left hover:bg-sage-50",
                      children: [
                        state === "completed" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "grid size-7 shrink-0 place-items-center rounded-full bg-sage-600 text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Check, { className: "size-4" }) }) : state === "active" ? /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "grid size-7 shrink-0 place-items-center rounded-full bg-sage-900 text-xs font-semibold text-white", children: i + 1 }) : /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "grid size-7 shrink-0 place-items-center rounded-full bg-sage-100 text-xs font-semibold text-sage-500", children: i + 1 }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 text-sm font-medium text-sage-900", children: s.short }),
                        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-semibold uppercase tracking-wide text-sage-500", children: state === "completed" ? "Done" : state === "active" ? "Here now" : "" })
                      ]
                    }
                  ) }, s.key);
                }) })
              ]
            }
          )
        ]
      }
    ),
    confirmExit && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "fixed inset-0 z-[60] grid place-items-center p-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 bg-sage-900/40", onClick: () => setConfirmExit(false) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs(
        "div",
        {
          role: "alertdialog",
          "aria-label": "Leave this step",
          className: "relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl",
          children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Leave this step?" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm text-sage-600", children: "Your progress on this step won't be saved." }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-4 flex gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => setConfirmExit(false),
                  className: "flex-1 rounded-xl border border-sage-200 bg-white py-2.5 text-sm font-semibold text-sage-700",
                  children: "Cancel"
                }
              ),
              /* @__PURE__ */ jsxRuntimeExports.jsx(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    setConfirmExit(false);
                    onExit?.();
                  },
                  className: "flex-1 rounded-xl bg-sage-600 py-2.5 text-sm font-semibold text-white",
                  children: "Leave"
                }
              )
            ] })
          ]
        }
      )
    ] })
  ] });
}
const $$splitComponentImporter = () => import("../_birdId.setup-C_8Bu051.mjs");
const setupSearch = objectType({
  step: coerce.number().int().min(1).max(TOTAL_STEPS).optional()
});
const Route = createFileRoute("/_authenticated/birds/$birdId/setup")({
  head: () => ({
    meta: [{
      title: "Set up bird — Parrot Care Co-Pilot"
    }]
  }),
  validateSearch: setupSearch,
  component: lazyRouteComponent($$splitComponentImporter, "component")
});
const TermsRoute = Route$j.update({
  id: "/terms",
  path: "/terms",
  getParentRoute: () => Route$k
});
const ResetPasswordRoute = Route$i.update({
  id: "/reset-password",
  path: "/reset-password",
  getParentRoute: () => Route$k
});
const PrivacyRoute = Route$h.update({
  id: "/privacy",
  path: "/privacy",
  getParentRoute: () => Route$k
});
const AuthRoute = Route$g.update({
  id: "/auth",
  path: "/auth",
  getParentRoute: () => Route$k
});
const AuthenticatedRouteRoute = Route$f.update({
  id: "/_authenticated",
  getParentRoute: () => Route$k
});
const IndexRoute = Route$e.update({
  id: "/",
  path: "/",
  getParentRoute: () => Route$k
});
const AuthenticatedNotificationsRoute = Route$d.update({
  id: "/notifications",
  path: "/notifications",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedDashboardRoute = Route$c.update({
  id: "/dashboard",
  path: "/dashboard",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedAccountRoute = Route$b.update({
  id: "/account",
  path: "/account",
  getParentRoute: () => AuthenticatedRouteRoute
});
const SitterTokenRouteRoute = Route$a.update({
  id: "/sitter/$token",
  path: "/sitter/$token",
  getParentRoute: () => Route$k
});
const SitterTokenIndexRoute = Route$9.update({
  id: "/",
  path: "/",
  getParentRoute: () => SitterTokenRouteRoute
});
const SitterTokenScanRoute = Route$8.update({
  id: "/scan",
  path: "/scan",
  getParentRoute: () => SitterTokenRouteRoute
});
const SitterTokenGuideRoute = Route$7.update({
  id: "/guide",
  path: "/guide",
  getParentRoute: () => SitterTokenRouteRoute
});
const SitterTokenEmergencyRoute = Route$6.update({
  id: "/emergency",
  path: "/emergency",
  getParentRoute: () => SitterTokenRouteRoute
});
const SitterTokenCareSheetRoute = Route$5.update({
  id: "/care-sheet",
  path: "/care-sheet",
  getParentRoute: () => SitterTokenRouteRoute
});
const AuthenticatedBirdsNewRoute = Route$4.update({
  id: "/birds/new",
  path: "/birds/new",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedBirdsBirdIdRoute = Route$3.update({
  id: "/birds/$birdId",
  path: "/birds/$birdId",
  getParentRoute: () => AuthenticatedRouteRoute
});
const AuthenticatedBirdsBirdIdIndexRoute = Route$2.update({
  id: "/",
  path: "/",
  getParentRoute: () => AuthenticatedBirdsBirdIdRoute
});
const ApiPublicHooksCarePlanRemindersRoute = Route$1.update({
  id: "/api/public/hooks/care-plan-reminders",
  path: "/api/public/hooks/care-plan-reminders",
  getParentRoute: () => Route$k
});
const AuthenticatedBirdsBirdIdSetupRoute = Route.update({
  id: "/setup",
  path: "/setup",
  getParentRoute: () => AuthenticatedBirdsBirdIdRoute
});
const AuthenticatedBirdsBirdIdRouteChildren = {
  AuthenticatedBirdsBirdIdSetupRoute,
  AuthenticatedBirdsBirdIdIndexRoute
};
const AuthenticatedBirdsBirdIdRouteWithChildren = AuthenticatedBirdsBirdIdRoute._addFileChildren(
  AuthenticatedBirdsBirdIdRouteChildren
);
const AuthenticatedRouteRouteChildren = {
  AuthenticatedAccountRoute,
  AuthenticatedDashboardRoute,
  AuthenticatedNotificationsRoute,
  AuthenticatedBirdsBirdIdRoute: AuthenticatedBirdsBirdIdRouteWithChildren,
  AuthenticatedBirdsNewRoute
};
const AuthenticatedRouteRouteWithChildren = AuthenticatedRouteRoute._addFileChildren(AuthenticatedRouteRouteChildren);
const SitterTokenRouteRouteChildren = {
  SitterTokenCareSheetRoute,
  SitterTokenEmergencyRoute,
  SitterTokenGuideRoute,
  SitterTokenScanRoute,
  SitterTokenIndexRoute
};
const SitterTokenRouteRouteWithChildren = SitterTokenRouteRoute._addFileChildren(SitterTokenRouteRouteChildren);
const rootRouteChildren = {
  IndexRoute,
  AuthenticatedRouteRoute: AuthenticatedRouteRouteWithChildren,
  AuthRoute,
  PrivacyRoute,
  ResetPasswordRoute,
  TermsRoute,
  SitterTokenRouteRoute: SitterTokenRouteRouteWithChildren,
  ApiPublicHooksCarePlanRemindersRoute
};
const routeTree = Route$k._addFileChildren(rootRouteChildren)._addFileTypes();
const getRouter = () => {
  const queryClient = new QueryClient();
  const router2 = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0
  });
  return router2;
};
const router = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  getRouter
}, Symbol.toStringTag, { value: "Module" }));
export {
  Route$g as R,
  SetupShell as S,
  TOTAL_STEPS as T,
  Route$c as a,
  Route$a as b,
  createSsrRpc as c,
  Route$9 as d,
  useSitterContext as e,
  toggleTaskCompletion as f,
  getSitterContext as g,
  Route$8 as h,
  uploadDroppingsPhoto as i,
  Route$7 as j,
  getGuideCards as k,
  Route$6 as l,
  Route$5 as m,
  Route$2 as n,
  Route as o,
  SETUP_STEPS as p,
  router as r,
  submitHealthScan as s,
  track as t,
  useServerFn as u
};
