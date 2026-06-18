import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { D as Disclaimer } from "./Disclaimer-BfRf9x0C.mjs";
import { B as BrandLogo } from "./BrandLogo-B5fKKIHf.mjs";
import { b as ClipboardList } from "../_libs/lucide-react.mjs";
import "../_libs/tanstack__router-core.mjs";
import "../_libs/tanstack__history.mjs";
import "../_libs/cookie-es.mjs";
import "../_libs/seroval.mjs";
import "../_libs/seroval-plugins.mjs";
import "node:stream/web";
import "node:stream";
import "../_libs/react-dom.mjs";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "../_libs/isbot.mjs";
import "./triage-DfSRYuT8.mjs";
function Welcome() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-screen bg-[#f4f1e8]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto flex min-h-screen max-w-md flex-col px-5 py-10", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(BrandLogo, { size: "md" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-12 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-balance text-4xl font-medium leading-[1.05] tracking-tight", children: "Calm, clear care for your bird — even when you can't be there." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-pretty text-base text-[#5f5e5a]", children: "Owners build a thorough care plan once. Sitters get a secure link with today's routine, a daily health scan, and one-tap emergency contacts." })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-10 space-y-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/auth", search: {
        mode: "signup"
      }, className: "block rounded-2xl bg-[#1a3d2e] px-5 py-5 text-white shadow-sm active:scale-[0.99]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-widest opacity-80", children: "I'm an owner" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-lg font-medium", children: "Build my bird's care plan" })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(ClipboardList, { className: "size-6 shrink-0 opacity-80" })
      ] }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-[20px] bg-[#efe9da] p-5", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]", children: "I'm a sitter" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-lg font-medium", children: "Open the link from the owner" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-sm text-[#5f5e5a]", children: "No signup needed — your sitter link unlocks today's routine, the health scan, the care guide, and emergency contacts." })
      ] })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-auto pt-10", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Disclaimer, { compact: true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-center text-[11px] text-[#5f5e5a]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/auth", search: {
        mode: "signin"
      }, className: "font-medium underline", children: "Already have an account? Sign in" }) })
    ] })
  ] }) });
}
export {
  Welcome as component
};
