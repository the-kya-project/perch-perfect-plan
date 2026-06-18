import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { t as track } from "./router-Cu2Tdjxf.mjs";
import { p as LoaderCircle, T as TriangleAlert } from "../_libs/lucide-react.mjs";
function ClipPlayer({
  src,
  label,
  className = "",
  poster
}) {
  const [state, setState] = reactExports.useState("loading");
  const firedRef = reactExports.useRef(false);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `relative overflow-hidden bg-black ${className}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "video",
      {
        src,
        poster,
        controls: true,
        playsInline: true,
        preload: "metadata",
        className: "size-full object-contain",
        onLoadedMetadata: () => setState("ready"),
        onCanPlay: () => setState("ready"),
        onError: () => setState("error"),
        onPlay: () => {
          if (!firedRef.current) {
            firedRef.current = true;
            track("clip_viewed", { has_label: !!label });
          }
        },
        "aria-label": label
      }
    ),
    state === "loading" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "pointer-events-none absolute inset-0 grid place-items-center bg-black/40 text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(LoaderCircle, { className: "size-3.5 animate-spin" }),
      " Loading clip…"
    ] }) }),
    state === "error" && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-0 grid place-items-center bg-sage-900/95 p-3 text-center text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex max-w-[90%] flex-col items-center gap-1.5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-5 text-warn-amber" }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-semibold", children: "This clip can't play here." }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] opacity-80", children: "Ask the owner to re-upload it from the bird's setup so it's converted for all devices." })
    ] }) })
  ] });
}
export {
  ClipPlayer as C
};
