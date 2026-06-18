import { j as jsxRuntimeExports } from "../_libs/react.mjs";
const PARROT_TEAL = "/kya_parrot_icon_teal.png";
const PARROT_WHITE = "/kya_parrot_icon_white.png";
const ICON_SIZE = {
  sm: "size-8",
  md: "size-10",
  lg: "size-14"
};
const TITLE_SIZE = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl"
};
const TAGLINE_SIZE = {
  sm: "text-[10px]",
  md: "text-[11px]",
  lg: "text-xs"
};
function BrandLogo({
  variant = "light",
  size = "md",
  showTagline = true,
  className = ""
}) {
  const isDark = variant === "dark";
  const iconSrc = isDark ? PARROT_WHITE : PARROT_TEAL;
  const titleColor = isDark ? "text-white" : "text-sage-900";
  const taglineColor = isDark ? "text-white/75" : "text-[#5f5e5a]";
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `flex items-center gap-2.5 ${className}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(
      "img",
      {
        src: iconSrc,
        alt: "",
        className: `${ICON_SIZE[size]} shrink-0 object-contain`
      }
    ),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "leading-tight", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `${TITLE_SIZE[size]} font-medium tracking-tight ${titleColor}`, children: "Parrot Care Co-Pilot" }),
      showTagline && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: `${TAGLINE_SIZE[size]} ${taglineColor}`, children: "by The Kya Project" })
    ] })
  ] });
}
export {
  BrandLogo as B
};
