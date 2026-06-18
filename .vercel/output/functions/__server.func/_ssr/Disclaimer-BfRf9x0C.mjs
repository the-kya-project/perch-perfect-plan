import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { T as TRIAGE_DISCLAIMER } from "./triage-DfSRYuT8.mjs";
import { I as Info, T as TriangleAlert } from "../_libs/lucide-react.mjs";
function Disclaimer({ compact = false }) {
  if (compact) {
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex items-start gap-1.5 text-[11px] leading-snug text-[#5f5e5a]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "mt-px size-3 shrink-0", "aria-hidden": true }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Note:" }),
        " Not a substitute for veterinary care. Call a vet for any medical concern."
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "rounded-[16px] bg-[#1a3d2e] p-3 text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs leading-relaxed opacity-90", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium", children: "Note: " }),
    TRIAGE_DISCLAIMER
  ] }) });
}
function VetReviewBanner() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex items-center gap-1.5 rounded-full border border-warn-amber/40 bg-warn-amber/10 px-2 py-1 text-[11px] font-medium text-warn-amber", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-3 shrink-0", "aria-hidden": true }),
    "Not vet-reviewed — placeholder guidance pending licensed avian-vet review."
  ] });
}
export {
  Disclaimer as D,
  VetReviewBanner as V
};
