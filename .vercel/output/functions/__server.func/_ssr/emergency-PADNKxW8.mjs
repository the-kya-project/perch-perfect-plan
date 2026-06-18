import { j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { l as Route$6, e as useSitterContext } from "./router-Cu2Tdjxf.mjs";
import "../_libs/sonner.mjs";
import "../_libs/seroval.mjs";
import { A as ArrowLeft, T as TriangleAlert, x as Phone } from "../_libs/lucide-react.mjs";
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
import "../_libs/tanstack__react-query.mjs";
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
function Emergency() {
  const {
    token
  } = Route$6.useParams();
  const {
    data: ctx
  } = useSitterContext(token);
  const c = ctx.contacts ?? {};
  const playbooks = [{
    title: "Trouble breathing / open-mouth",
    signs: "Open-mouth breathing, tail bobbing at rest, wheezing or clicking, wings held away, weakness.",
    steps: ["Stop handling — birds need chest movement to breathe.", "Move the bird away from fumes, smoke, heat, and stress to fresh air.", "Keep warm (~85–90°F if shocky, heat on ONE side only), quiet, and dim.", "Don't mist, bathe, or force water.", "Call the avian vet and prepare to transport."]
  }, {
    title: "Bleeding",
    signs: "Active blood from a nail, feather, skin, or beak.",
    steps: ["Stay calm.", "Apply gentle, steady pressure with clean gauze.", "Use cornstarch or styptic powder on NAILS or FEATHERS only — never in mouth, eyes, or on skin.", "Keep warm and quiet.", "A broken blood feather can bleed heavily — don't pull it yourself unless a vet instructs.", "Call the vet if bleeding doesn't stop in 5–10 minutes or the bird seems weak."]
  }, {
    title: "Suspected poisoning",
    signs: "Chewed metal, paint, plant, medication, household chemical, or toxic food.",
    steps: ["Remove the bird from the substance and the substance from reach.", "Do NOT make the bird vomit.", "Save or photograph the packaging or material.", "Note what was eaten or chewed and when.", "Call the avian vet or ASPCA Animal Poison Control: (888) 426-4435."]
  }, {
    title: "Fumes or smoke",
    signs: "Nonstick cookware overheated, smoke, aerosol, candle, essential oil, cleaner, burnt food.",
    steps: ["Move the bird to fresh air immediately if safe to do so.", "Turn off the source.", "Ventilate the home.", "Keep the bird calm and warm.", "Call the avian vet even if the bird looks okay."]
  }, {
    title: "Cat or dog bite or scratch",
    signs: "Any contact between a cat/dog and the bird — even with no visible wound.",
    steps: ["Treat as life-threatening — bacteria from cat/dog mouths and claws can kill a bird within hours.", "Separate the animals.", "Keep the bird warm and quiet.", "Don't assume the bird is fine.", "Call the avian vet immediately — antibiotics within hours are critical."]
  }, {
    title: "Seizure",
    signs: "Uncontrolled movement, loss of balance, unresponsive episode.",
    steps: ["Don't restrain the bird.", "Clear nearby hazards from the cage floor.", "Dim the room and keep it quiet.", "Note how long the seizure lasts.", "Keep the bird warm afterward.", "Call the avian vet."]
  }, {
    title: "Overheating",
    signs: "Open-mouth breathing, wings held away from body, panting, weakness.",
    steps: ["Move the bird to shade or a cooler room.", "Offer cool water.", "Lightly mist the FEET if tolerated.", "Don't use ice water.", "Call the vet if the bird doesn't recover quickly."]
  }, {
    title: "Egg binding (life-threatening)",
    signs: "Straining, sitting low, wide stance, tail bobbing, weakness, not passing droppings, swollen lower belly.",
    steps: ["Keep warm and calm.", "Don't press on the abdomen.", "Don't try to pull an egg.", "Call the avian vet urgently."]
  }, {
    title: "Escaped outside",
    signs: "Flighted parrot has flown out of an open door or window.",
    steps: ["Don't panic. Don't chase wildly.", "Don't take your eyes off the bird — note exactly where it lands.", "Call to the bird using familiar words and its name.", "Bring the cage outside if safe, with favorite food in view.", "Play recordings of the bird or familiar household sounds.", "Call the owner immediately.", "Search high (trees, roofs, poles) and wide. Birds often quiet at dusk and call at first light — keep looking.", "Post in local lost-pet and bird groups; contact nearby vets, shelters, animal control, and Parrot Alert."]
  }, {
    title: "Transport to the vet",
    signs: "Any emergency requiring travel.",
    steps: ["Use a small carrier or box lined with a towel — not loose bedding.", "Warm to ~85–90°F using a wrapped warm water bottle or heat pack on ONE side only.", "Cover the carrier to keep it dark and quiet.", "Bring the owner's care sheet, any medications, photos of abnormal droppings, and anything the bird ate or chewed (with packaging).", "Secure in the car. Drive calmly. No blasting music or vents at the bird.", "Call ahead so the vet is ready when you arrive."]
  }];
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-[#1a3d2e] text-white", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "sticky top-0 border-b border-white/10 bg-[#1a3d2e]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center gap-3 px-4 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/sitter/$token", params: {
        token
      }, className: "rounded p-1 text-white/70", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-5" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "flex items-center gap-2 text-sm font-medium", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "size-4 text-warn-amber" }),
        " Emergency mode"
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-4 px-4 py-5 pb-28", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl border border-warn-amber/40 bg-warn-amber/10 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-widest text-warn-amber", children: "The four emergency rules" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("ol", { className: "mt-2 list-decimal space-y-1 pl-5 text-sm text-white", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Stay calm." }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
            "Keep ",
            ctx.bird.name,
            " warm — about 85–90°F if sick or shocky. Heat on one side only."
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Keep the bird quiet, dim, and minimally handled." }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: "Call the avian vet and prepare to transport." })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-white/70", children: "You will never be in trouble for calling too soon." })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CallBtn, { label: "Call avian vet", name: c.avian_vet_name, phone: c.avian_vet_phone, urgent: true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CallBtn, { label: "Call emergency vet", name: c.emergency_vet_name, phone: c.emergency_vet_phone, urgent: true }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CallBtn, { label: "Call owner", phone: c.owner_phone }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CallBtn, { label: "Call backup contact", name: c.backup_name, phone: c.backup_phone }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(CallBtn, { label: "Poison control", name: c.poison_control ? void 0 : "ASPCA Animal Poison Control", phone: c.poison_control || "8884264435" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl bg-white/5 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-widest text-white/60", children: "Critical info" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 grid grid-cols-2 gap-3 text-sm", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { label: "Carrier", value: c.carrier_location }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { label: "First-aid kit", value: c.first_aid_kit_location }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { label: "Care authorization", value: c.emergency_authorization }),
          /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { label: "Spending limit", value: c.spending_limit })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-widest text-white/60", children: "Quick playbooks" }),
        playbooks.map((p) => /* @__PURE__ */ jsxRuntimeExports.jsxs("details", { className: "rounded-2xl bg-white/5 p-4", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("summary", { className: "cursor-pointer text-sm font-medium", children: p.title }),
          p.signs && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-xs italic text-white/60", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium not-italic uppercase tracking-widest", children: "Signs:" }),
            " ",
            p.signs
          ] }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("ol", { className: "mt-2 list-decimal space-y-1 pl-5 text-sm text-white/80", children: p.steps.map((s, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { children: s }, i)) })
        ] }, p.title))
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "pt-2 text-center text-[11px] text-white/40", children: "Care guidance from The Kya Project · Parrot Care Bible for Pet Sitters." })
    ] })
  ] });
}
function formatPhone(raw) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return raw.trim();
}
function telHref(raw) {
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits ? `tel:${digits}` : `tel:${raw.trim()}`;
}
function CallBtn({
  label,
  name,
  phone,
  urgent
}) {
  if (!phone) return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-2xl bg-white/5 p-4 text-sm text-white/50", children: [
    label,
    ": not provided by owner."
  ] });
  const display = formatPhone(phone);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("a", { href: telHref(phone), className: `flex items-center justify-between rounded-2xl p-4 ${urgent ? "bg-warn-red" : "bg-white"} ${urgent ? "text-white" : "text-[#1a3d2e]"} active:scale-[0.99]`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-medium uppercase tracking-widest opacity-70", children: label }),
      name && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs opacity-80", children: name }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-medium", children: display })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Phone, { className: "size-5" })
  ] });
}
function Info({
  label,
  value
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-medium uppercase text-white/40", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-white", children: value || "—" })
  ] });
}
export {
  Emergency as component
};
