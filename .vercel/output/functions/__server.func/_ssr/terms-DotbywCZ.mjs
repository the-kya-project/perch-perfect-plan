import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { A as ArrowLeft } from "../_libs/lucide-react.mjs";
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
function TermsPage() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-screen bg-sage-50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-2xl px-5 py-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/auth", search: {
      mode: "signin"
    }, className: "inline-flex items-center gap-1 text-sm text-sage-600", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-4" }),
      " Back"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-6 text-2xl font-bold tracking-tight", children: "Terms of Use" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800", children: "DRAFT — replace with reviewed copy" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "prose prose-sage mt-6 space-y-4 text-sm leading-relaxed text-sage-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "DRAFT — replace with reviewed copy." }),
        " This page is placeholder text. Before launch, replace it with terms reviewed by your legal counsel."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Using the service" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Parrot Care Co-Pilot is a tool to help you organise your bird's care and share it with sitters. It is not veterinary advice. In an emergency, contact an avian vet." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Your account" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "You're responsible for keeping your sign-in credentials safe and for any sit links you share. Revoke a link if you no longer want the sitter to have access." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Your content" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "You own the information you add — bird profiles, plans, clips, logs. You grant us the permissions needed to store and display it to you and the sitters you authorise." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Acceptable use" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Don't use the service to upload unlawful content, infringe others' rights, or attempt to access another account's data." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Changes" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "We may update these terms; significant changes will be communicated in-app or by email." })
    ] })
  ] }) });
}
export {
  TermsPage as component
};
