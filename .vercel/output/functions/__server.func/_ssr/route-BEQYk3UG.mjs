import { j as jsxRuntimeExports, r as reactExports } from "../_libs/react.mjs";
import { d as useSearch, e as useNavigate, O as Outlet, L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { u as useServerFn, b as Route$a, t as track, g as getSitterContext } from "./router-Cu2Tdjxf.mjs";
import "../_libs/sonner.mjs";
import "../_libs/seroval.mjs";
import { b as ClipboardList, n as Stethoscope, o as BookOpen, T as TriangleAlert } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "../_libs/tanstack__query-core.mjs";
import "./client-HgPYj8QJ.mjs";
import "../_libs/supabase__supabase-js.mjs";
import "../_libs/supabase__postgrest-js.mjs";
import "../_libs/supabase__realtime-js.mjs";
import "../_libs/supabase__phoenix.mjs";
import "../_libs/supabase__storage-js.mjs";
import "../_libs/iceberg-js.mjs";
import "../_libs/supabase__auth-js.mjs";
import "tslib";
import "../_libs/supabase__functions-js.mjs";
import "./server-9nIpN7MJ.mjs";
import "node:async_hooks";
import "../_libs/h3-v2.mjs";
import "../_libs/rou3.mjs";
import "../_libs/srvx.mjs";
import "../_libs/zod.mjs";
function EmergencyBar({ token }) {
  const item = "flex flex-col items-center gap-0.5 text-[#8a897f] [&.active]:text-[#1a3d2e]";
  return /* @__PURE__ */ jsxRuntimeExports.jsx("nav", { className: "fixed inset-x-0 bottom-0 z-30 border-t border-[#e3ded0] bg-[#f4f1e8]/95 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2.5 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center justify-between gap-2", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/sitter/$token", params: { token }, activeOptions: { exact: true }, className: item, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ClipboardList, { className: "size-5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-medium", children: "Today" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/sitter/$token/scan", params: { token }, className: item, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Stethoscope, { className: "size-5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-medium", children: "Scan" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/sitter/$token/guide", params: { token }, className: item, children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "size-5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[11px] font-medium", children: "Guide" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(
      Link,
      {
        to: "/sitter/$token/emergency",
        params: { token },
        className: "flex items-center gap-2 rounded-full bg-[#993C1D] px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-[#993C1D]/20 active:scale-95",
        children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-4 shrink-0" }),
          "Emergency"
        ]
      }
    )
  ] }) });
}
function SitterRoot() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxRuntimeExports.jsx(FullPageSkeleton, {}), children: /* @__PURE__ */ jsxRuntimeExports.jsx(SitterLayout, {}) });
}
function SitterLayout() {
  const {
    token
  } = Route$a.useParams();
  const navigate = useNavigate();
  const {
    data: ctx
  } = useSitterContext(token);
  const firedRef = reactExports.useRef(false);
  reactExports.useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    track("sitter_link_opened", {
      bird_count: ctx.birds?.length ?? 0
    });
  }, [ctx]);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-[#f4f1e8] pb-32", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "sticky top-0 z-30 border-b border-[#e3ded0] bg-[#f4f1e8]/95 backdrop-blur", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center gap-2 px-4 py-2.5", children: [
      ctx.birds.length > 1 && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 text-xs font-medium text-[#5f5e5a]", children: "Caring for" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex min-w-0 flex-1 items-center gap-2 overflow-x-auto", children: ctx.birds.map((b) => {
          const active = b.id === ctx.activeBirdId;
          return /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => navigate({
            to: ".",
            search: {
              birdId: b.id
            }
          }), "aria-pressed": active, className: `shrink-0 rounded-full px-4 py-1.5 text-sm transition ${active ? "bg-[#1a3d2e] font-medium text-white shadow-sm ring-1 ring-[#1a3d2e]" : "bg-[#efe9da] font-medium text-[#5f5e5a] ring-1 ring-sage-200"}`, children: b.name }, b.id);
        }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "ml-auto shrink-0 rounded-full bg-[#d6e8dc] px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-[#1a5e3f]", children: "Sit active" })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(reactExports.Suspense, { fallback: /* @__PURE__ */ jsxRuntimeExports.jsx(TabSkeleton, {}), children: /* @__PURE__ */ jsxRuntimeExports.jsx(Outlet, {}) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(EmergencyBar, { token })
  ] });
}
function useSitterContext(token) {
  const search = useSearch({
    from: "/sitter/$token"
  });
  const birdId = search.birdId;
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
function SkeletonLine({
  className = ""
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `animate-pulse rounded-md bg-sage-200/70 ${className}` });
}
function TabSkeleton() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-md space-y-4 px-4 py-5", role: "status", "aria-live": "polite", "aria-label": "Loading", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: "Loading…" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 rounded-2xl bg-[#efe9da] p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-4 w-1/2" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-3 w-3/4" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-3 w-2/3" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 rounded-2xl bg-[#efe9da] p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-4 w-2/5" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-10 w-full" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-10 w-full" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-10 w-5/6" })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-3 rounded-2xl bg-[#efe9da] p-4", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-4 w-1/3" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-10 w-full" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-10 w-full" })
    ] })
  ] });
}
function FullPageSkeleton() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-[#f4f1e8] pb-32", role: "status", "aria-live": "polite", "aria-label": "Loading sitter view", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "sr-only", children: "Loading sitter view…" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "border-b border-[#e3ded0] bg-[#f4f1e8]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center gap-2 px-4 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "size-9 rounded-full" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1 space-y-1.5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-3 w-1/3" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(SkeletonLine, { className: "h-2 w-1/4" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(TabSkeleton, {})
  ] });
}
export {
  SitterRoot as component,
  useSitterContext
};
