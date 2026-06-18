import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { h as Route$8, e as useSitterContext, u as useServerFn, t as track, s as submitHealthScan, i as uploadDroppingsPhoto } from "./router-Cu2Tdjxf.mjs";
import { c as useMutation } from "../_libs/tanstack__react-query.mjs";
import { S as SCAN_FIELDS, c as computeTriage } from "./triage-DfSRYuT8.mjs";
import { V as VetReviewBanner } from "./Disclaimer-BfRf9x0C.mjs";
import { t as toast } from "../_libs/sonner.mjs";
import "../_libs/seroval.mjs";
import { A as ArrowLeft, q as Camera } from "../_libs/lucide-react.mjs";
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
function ScanPage() {
  const {
    token
  } = Route$8.useParams();
  const {
    data: ctx
  } = useSitterContext(token);
  const [answers, setAnswers] = reactExports.useState({});
  const [notes, setNotes] = reactExports.useState("");
  const [photo, setPhoto] = reactExports.useState(null);
  const [result, setResult] = reactExports.useState(null);
  const [showErrors, setShowErrors] = reactExports.useState(false);
  reactExports.useEffect(() => {
    setAnswers({});
    setNotes("");
    setPhoto(null);
    setResult(null);
    setShowErrors(false);
  }, [ctx.activeBirdId]);
  const submit = useServerFn(submitHealthScan);
  const upload = useServerFn(uploadDroppingsPhoto);
  const m = useMutation({
    mutationFn: async () => {
      const filled = Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, answers[f.key]]));
      const res = await submit({
        data: {
          token,
          birdId: ctx.activeBirdId,
          answers: filled,
          notes: notes || void 0
        }
      });
      if (photo) await upload({
        data: {
          token,
          birdId: ctx.activeBirdId,
          dataUrl: photo,
          notes: "Attached to health scan"
        }
      });
      return res;
    },
    onSuccess: (res) => {
      setResult(res.triage);
      track("health_scan_run", {
        severity: res.triage?.status ?? "unknown",
        had_photo: !!photo
      });
      toast.success("Health scan logged.");
    },
    onError: (e) => toast.error(e.message ?? "Could not log scan.")
  });
  function previewTriage() {
    const filled = Object.fromEntries(SCAN_FIELDS.map((f) => [f.key, answers[f.key]]));
    return computeTriage(filled);
  }
  function handleSubmit() {
    const firstMissing = SCAN_FIELDS.find((f) => !answers[f.key]);
    if (firstMissing) {
      setShowErrors(true);
      const el = document.getElementById(`scan-field-${firstMissing.key}`);
      el?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
      toast.error("Please answer every question before submitting.");
      return;
    }
    m.mutate();
  }
  if (result) {
    const color = result.status === "red" ? "bg-warn-red" : result.status === "yellow" ? "bg-warn-amber" : "bg-warn-green";
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-4 px-4 py-6", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `rounded-2xl ${color} p-6 text-white`, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-widest opacity-80", children: result.status === "red" ? "Call vet now" : result.status === "yellow" ? "Monitor & message owner" : "All clear logged" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "mt-1 text-2xl font-medium leading-tight", children: result.message })
      ] }),
      result.reasons.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-[#efe9da] p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-widest text-[#5f5e5a]", children: "What you flagged" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "mt-2 list-disc pl-5 text-sm text-[#1a3d2e]", children: result.reasons.map((r, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: r }, i)) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex gap-2", children: [
        result.status !== "green" && /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/sitter/$token/emergency", params: {
          token
        }, className: "flex-1 rounded-xl bg-[#1a3d2e] py-3 text-center text-sm font-medium text-white", children: "Open emergency contacts" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/sitter/$token", params: {
          token
        }, className: "flex-1 rounded-xl border border-[#e0d8c4] py-3 text-center text-sm font-medium", children: "Back to today" })
      ] })
    ] });
  }
  const allAnswered = SCAN_FIELDS.every((f) => answers[f.key]);
  function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 18e5) {
      toast.error("Photo too large — please pick a smaller one.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result);
    reader.readAsDataURL(file);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-[#f4f1e8]", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "border-b border-[#e0d8c4] bg-[#f4f1e8]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center gap-3 px-4 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/sitter/$token", params: {
        token
      }, className: "rounded p-1 text-[#5f5e5a]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-5" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-sm font-medium", children: [
        "Daily health scan — ",
        ctx.bird.name
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-4 px-4 py-5 pb-32", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(VetReviewBanner, {}),
      SCAN_FIELDS.map((f) => {
        const a = answers[f.key];
        const missing = showErrors && !a;
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { id: `scan-field-${f.key}`, className: `rounded-2xl bg-[#efe9da] p-4 ${missing ? "ring-2 ring-warn-red" : ""}`, children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium", children: f.question }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 grid grid-cols-3 gap-2", children: ["normal", "not_sure", "concerning"].map((opt) => /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: () => setAnswers({
            ...answers,
            [f.key]: opt
          }), className: `rounded-lg border px-1 py-2.5 text-[11px] font-medium ${a === opt ? opt === "concerning" ? "border-warn-red bg-warn-red/10 text-warn-red" : opt === "not_sure" ? "border-warn-amber bg-warn-amber/10 text-warn-amber" : "border-warn-green bg-warn-green/10 text-warn-green" : "border-[#e0d8c4] text-[#5f5e5a]"}`, children: opt === "not_sure" ? "Not sure" : opt === "concerning" ? "Concerning" : "Normal" }, opt)) }),
          missing && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-3 text-[11px] font-medium text-warn-red", children: "Please answer this before submitting." }),
          a === "not_sure" && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 rounded bg-warn-amber/10 p-2 text-[11px] leading-relaxed text-[#1a3d2e]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "Look again: " }),
            f.helpNotSure
          ] }),
          a === "concerning" && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 rounded bg-warn-red/10 p-2 text-[11px] leading-relaxed text-[#1a3d2e]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("b", { children: "Watch for: " }),
            f.helpConcerning
          ] })
        ] }, f.key);
      }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-[#efe9da] p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium", children: "Optional: photo of droppings" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-xs text-[#5f5e5a]", children: "Take a photo against white paper if anything looks off." }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#e0d8c4] py-3 text-sm font-medium text-[#5f5e5a]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Camera, { className: "size-4" }),
          " ",
          photo ? "Replace photo" : "Add photo",
          /* @__PURE__ */ jsxRuntimeExports.jsx("input", { type: "file", accept: "image/*", capture: "environment", className: "hidden", onChange: handlePhoto })
        ] }),
        photo && /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: photo, alt: "droppings preview", className: "mt-2 max-h-40 rounded-lg" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("section", { className: "rounded-2xl bg-[#efe9da] p-4", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("label", { className: "block", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]", children: "Notes for the owner" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("textarea", { value: notes, onChange: (e) => setNotes(e.target.value), rows: 3, className: "w-full rounded-xl border border-[#e0d8c4] bg-white p-3 text-sm" })
      ] }) }),
      allAnswered && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-xl bg-[#efe9da] p-3 text-xs text-[#5f5e5a]", children: [
        "Preview: ",
        /* @__PURE__ */ jsxRuntimeExports.jsx("b", { className: "uppercase", children: previewTriage().status }),
        " — ",
        previewTriage().message
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("button", { onClick: handleSubmit, disabled: m.isPending, className: "w-full rounded-xl bg-[#1a3d2e] py-3.5 text-sm font-medium text-white disabled:opacity-60", children: m.isPending ? "Logging..." : "Submit health scan" })
    ] })
  ] });
}
export {
  ScanPage as component
};
