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
function PrivacyPage() {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "min-h-screen bg-sage-50", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-2xl px-5 py-8", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/auth", search: {
      mode: "signin"
    }, className: "inline-flex items-center gap-1 text-sm text-sage-600", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-4" }),
      " Back"
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-6 text-2xl font-bold tracking-tight", children: "Privacy Policy" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800", children: "DRAFT — replace with reviewed copy" }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "prose prose-sage mt-6 space-y-4 text-sm leading-relaxed text-sage-700", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: "DRAFT — replace with reviewed copy." }),
        " This page is placeholder text. Before launch, replace it with a privacy policy reviewed by your legal counsel."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "What we collect" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Account details (email, display name), bird profiles and care plans you create, sit records and sitter activity, photos and clips you upload, and standard request/usage metadata." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "How we use it" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "To run the service: store your bird care plans, share them with sitters you invite, and surface your data back to you in the app. We do not sell your personal data." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Sharing with sitters" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "When you create a sit, the invited sitter can access the care plan, contacts, and media for the assigned birds while their link is active. Sitter access expires when the sit ends, or immediately if you revoke the link." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Marketing" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "We only send marketing or community updates if you opt in at signup or in account settings. You can opt out at any time." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Deleting your account" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "You can permanently delete your account from account settings. This removes your birds, care plans, sits, logs, photos, and marketing-contact record." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-base font-bold text-sage-900", children: "Contact" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: "Email the team at the address shown on the marketing site." })
    ] })
  ] }) });
}
export {
  PrivacyPage as component
};
