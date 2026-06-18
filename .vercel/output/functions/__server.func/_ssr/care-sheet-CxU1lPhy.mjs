import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { m as Route$5, e as useSitterContext, t as track } from "./router-Cu2Tdjxf.mjs";
import { C as ClipPlayer } from "./ClipPlayer-TEvTBXF2.mjs";
import { f as formatAmountUnit, p as prettyLabel, a as formatRemovalMinutes, T as TREATS_FREQ_LABELS, W as WATER_FREQ_LABELS, B as BOWL_WASH_LABELS, O as OUT_OF_CAGE_LABELS } from "./labels-p1Eyqujr.mjs";
import "../_libs/sonner.mjs";
import "../_libs/seroval.mjs";
import { A as ArrowLeft, T as TriangleAlert, c as ShieldAlert } from "../_libs/lucide-react.mjs";
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
function has(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}
function Section({
  title,
  children,
  danger = false
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: `rounded-2xl p-4 ${danger ? "bg-warn-red/5 ring-1 ring-warn-red/30" : "bg-[#efe9da] shadow-sm"}`, children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: `text-[11px] font-medium uppercase tracking-widest ${danger ? "text-warn-red" : "text-[#5f5e5a]"}`, children: title }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-3 space-y-3", children })
  ] });
}
function RichText({
  text
}) {
  const lines = text.split("\n");
  const blocks = [];
  let bullets = [];
  const flushBullets = (key) => {
    if (!bullets.length) return;
    blocks.push(/* @__PURE__ */ jsxRuntimeExports.jsx("ul", { className: "list-disc space-y-1 pl-5 marker:text-[#5f5e5a]", children: bullets.map((b, i) => /* @__PURE__ */ jsxRuntimeExports.jsx("li", { className: "pl-0.5", children: b }, i)) }, key));
    bullets = [];
  };
  lines.forEach((raw, i) => {
    const m = raw.match(/^\s*•\s+(.*)$/);
    if (m) {
      bullets.push(m[1]);
      return;
    }
    flushBullets(`ul-${i}`);
    if (raw.trim()) blocks.push(/* @__PURE__ */ jsxRuntimeExports.jsx("p", { children: raw }, i));
  });
  flushBullets("ul-end");
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "space-y-1.5", children: blocks });
}
function Field({
  label,
  value
}) {
  if (!has(value)) return null;
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-medium uppercase tracking-wider text-[#5f5e5a]", children: label }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-0.5 text-sm text-[#1a3d2e] whitespace-pre-line", children: value })
  ] });
}
function Chips({
  items
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: items.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-[#d6e8dc] px-2.5 py-0.5 text-xs font-medium text-[#1a5e3f]", children: s }, s)) });
}
function DangerChips({
  items
}) {
  return /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex flex-wrap gap-1.5", children: items.map((s) => /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-warn-red px-2.5 py-1 text-xs font-bold text-white", children: s }, s)) });
}
function CareSheet() {
  const {
    token
  } = Route$5.useParams();
  const {
    data: ctx
  } = useSitterContext(token);
  const bird = ctx.bird;
  const plan = ctx.plan ?? {};
  const clips = ctx.watchClips ?? [];
  reactExports.useEffect(() => {
    track("care_sheet_viewed", {
      surface: "sitter"
    });
  }, []);
  const diet = plan.diet_types ?? [];
  const dietDetails = plan.diet_details ?? {};
  const freshFoods = plan.fresh_foods ?? [];
  const neverFeed = plan.never_feed ?? [];
  const hazards = plan.hazards ?? [];
  const feedingTimes = plan.feeding_times ?? [];
  const showBasics = has(bird.name) || has(bird.species) || has(bird.age) || has(bird.photo_url);
  const showFeeding = diet.length || plan.food_brand || plan.amount_value || feedingTimes.length || freshFoods.length || plan.fresh_foods_other || plan.treats_notes || plan.treats_frequency || plan.water_frequency || plan.water_notes || plan.food_storage || plan.food_hygiene_notes || plan.food_instructions || plan.water_instructions || plan.fresh_food_removal_minutes;
  const showHandling = has(plan.step_up) || has(plan.step_up_notes) || has(plan.handlers) || has(plan.likes) || has(plan.fears_triggers) || has(plan.bite_risk) || has(plan.handling_rules) || has(plan.known_triggers);
  const showHome = has(plan.cage_location) || has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules) || hazards.length || has(plan.hazards_other) || has(plan.off_limits) || has(plan.off_limits_rooms) || has(plan.safety_rules) || has(plan.other_pets);
  const showHealth = has(bird.normal_weight) || has(bird.normal_weight_min) || has(bird.normal_weight_max) || has(plan.whats_normal) || has(plan.normal_appetite) || has(plan.normal_droppings) || has(plan.normal_noise) || has(plan.normal_activity) || has(plan.normal_sleep) || has(plan.normal_behavior_with_strangers) || has(bird.medical_conditions) || has(bird.medications) || has(plan.medication_schedule) || ctx.baselineDroppingsUrl || ctx.baselineClipUrl;
  const handlingDangerous = /\b(no|do not|don'?t|never)\b/i.test(plan.handling_rules ?? "") || /\b(no|do not|don'?t|never)\b/i.test(plan.step_up ?? "");
  const weightStr = (() => {
    if (has(bird.normal_weight_min) && has(bird.normal_weight_max)) return `${bird.normal_weight_min}–${bird.normal_weight_max} g`;
    if (has(bird.normal_weight)) return `${bird.normal_weight} g`;
    return null;
  })();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "bg-[#1a3d2e]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto flex max-w-md items-center gap-3 px-4 py-3", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/sitter/$token", params: {
        token
      }, search: {
        birdId: ctx.activeBirdId
      }, className: "rounded p-1 text-white/90", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-5" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("h1", { className: "text-sm font-medium text-white", children: [
          bird.name,
          "'s care sheet"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] uppercase tracking-wider text-[#cdeab0]", children: "Owner-entered reference" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-4 px-4 py-5", children: [
      showBasics && /* @__PURE__ */ jsxRuntimeExports.jsx(Section, { title: "Basics", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-4", children: [
        bird.photo_url ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: bird.photo_url, alt: bird.name, className: "size-16 rounded-2xl object-cover ring-1 ring-[#e0d8c4]", style: {
          objectPosition: bird.photo_position ?? "50% 50%"
        } }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid size-16 place-items-center rounded-2xl bg-[#e3dcc9] text-xl font-medium text-[#2d6a4f]", children: bird.name.slice(0, 1).toUpperCase() }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex-1", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-lg font-medium leading-tight", children: bird.name }),
          has(bird.species) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm text-[#5f5e5a]", children: bird.species }),
          has(bird.age) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-[#5f5e5a]", children: bird.age })
        ] })
      ] }) }),
      clips.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Watch-first clips", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs text-[#5f5e5a]", children: "Short clips from the owner." }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "-mx-1 grid grid-cols-1 gap-3", children: clips.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-hidden rounded-xl bg-[#e8e1d0] ring-1 ring-[#e0d8c4]", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(ClipPlayer, { src: c.url, label: c.label, className: "aspect-video" }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "px-2 py-1.5 text-[12px] font-medium leading-tight", children: c.label })
        ] }, c.key)) })
      ] }),
      neverFeed.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Never feed — toxic to this bird", danger: true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DangerChips, { items: neverFeed }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex items-start gap-1.5 text-xs text-warn-red", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "mt-0.5 size-3.5 shrink-0" }),
          "Keep these completely out of reach."
        ] })
      ] }),
      showFeeding && /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Feeding & food", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "rounded bg-warn-amber/10 p-2 text-[11px] font-medium text-warn-amber", children: "Do not introduce new foods while the owner is away." }),
        has(plan.food_instructions) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Diet overview", value: /* @__PURE__ */ jsxRuntimeExports.jsx(RichText, { text: plan.food_instructions }) }),
        diet.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Diet types", value: /* @__PURE__ */ jsxRuntimeExports.jsx(Chips, { items: diet }) }),
        has(plan.diet_other) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Other diet", value: plan.diet_other }),
        Object.entries(dietDetails).map(([k, d]) => has(d?.brand) || has(d?.amount) || has(d?.notes) ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg bg-[#e8e1d0] p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-xs font-medium uppercase tracking-wider text-[#5f5e5a]", children: k.replace(/_/g, " ") }),
          has(d.brand) && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[#5f5e5a]", children: "Brand: " }),
            d.brand
          ] }),
          has(d.amount) && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[#5f5e5a]", children: "Amount: " }),
            d.unit ? formatAmountUnit(d.amount, d.unit) : d.amount
          ] }),
          has(d.notes) && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-sm whitespace-pre-line", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-[#5f5e5a]", children: "Notes: " }),
            d.notes
          ] })
        ] }, k) : null),
        (has(plan.food_brand) || has(plan.amount_value)) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Brand & amount", value: `${plan.food_brand ?? ""}${has(plan.amount_value) ? ` — ${formatAmountUnit(plan.amount_value, plan.amount_unit)}` : ""}`.trim() }),
        feedingTimes.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Feeding times", value: /* @__PURE__ */ jsxRuntimeExports.jsx(Chips, { items: feedingTimes }) }),
        freshFoods.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Fresh foods", value: /* @__PURE__ */ jsxRuntimeExports.jsx(Chips, { items: freshFoods }) }),
        has(plan.fresh_foods_other) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Other fresh foods", value: plan.fresh_foods_other }),
        (has(plan.treats_notes) || has(plan.treats_frequency)) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Treats", value: `${plan.treats_notes ?? ""}${has(plan.treats_frequency) ? `
Frequency: ${prettyLabel(plan.treats_frequency, TREATS_FREQ_LABELS)}` : ""}`.trim() }),
        (has(plan.water_frequency) || has(plan.water_notes) || has(plan.water_instructions)) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Water", value: [plan.water_frequency && `Water ${prettyLabel(plan.water_frequency, WATER_FREQ_LABELS)}`, plan.water_notes, plan.water_instructions].filter(Boolean).join("\n") }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg bg-[#e8e1d0] p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-medium uppercase tracking-wider text-[#5f5e5a]", children: "Freshness & hygiene" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "mt-1.5 space-y-1 text-sm text-[#1a3d2e]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              "Remove fresh food within ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: formatRemovalMinutes(plan.fresh_food_removal_minutes) }),
              " of serving."
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              "Wash food bowls: ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: prettyLabel(plan.food_bowl_wash_cadence, BOWL_WASH_LABELS) || "—" }),
              "."
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { children: [
              "Wash water bowl: ",
              /* @__PURE__ */ jsxRuntimeExports.jsx("strong", { children: prettyLabel(plan.water_bowl_wash_cadence, BOWL_WASH_LABELS) || "—" }),
              "."
            ] })
          ] }),
          has(plan.food_hygiene_notes) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-2 text-xs text-[#5f5e5a] whitespace-pre-line", children: plan.food_hygiene_notes })
        ] }),
        has(plan.food_storage) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Food storage", value: plan.food_storage })
      ] }),
      showHandling && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        (handlingDangerous || has(plan.bite_risk) || neverFeed.length > 0) && /* @__PURE__ */ jsxRuntimeExports.jsx(Section, { title: "Handling — read first", danger: true, children: /* @__PURE__ */ jsxRuntimeExports.jsxs("ul", { className: "space-y-1.5 text-sm text-[#1a3d2e]", children: [
          handlingDangerous && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { className: "mt-0.5 size-4 shrink-0 text-warn-red" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Handling restrictions apply — see the rules below before any contact." })
          ] }),
          has(plan.bite_risk) && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "mt-0.5 size-4 shrink-0 text-warn-red" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Watch for bite warning signs — full list in Handling & personality." })
          ] }),
          neverFeed.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("li", { className: "flex gap-2", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(TriangleAlert, { className: "mt-0.5 size-4 shrink-0 text-warn-red" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { children: "Never feed the toxic items listed above." })
          ] })
        ] }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Handling & personality", children: [
          has(plan.step_up) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Step up", value: plan.step_up }),
          has(plan.step_up_notes) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Step up notes", value: plan.step_up_notes }),
          has(plan.handlers) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Who can handle", value: plan.handlers }),
          has(plan.handling_rules) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Handling rules", value: plan.handling_rules }),
          has(plan.likes) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Likes", value: plan.likes }),
          (has(plan.fears_triggers) || has(plan.known_triggers)) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg bg-warn-amber/10 p-3 ring-1 ring-warn-amber/20", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-medium uppercase tracking-wider text-warn-amber", children: "Fears & triggers" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm whitespace-pre-line", children: [plan.fears_triggers, plan.known_triggers].filter(Boolean).join("\n") })
          ] }),
          has(plan.bite_risk) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "rounded-lg bg-warn-red/5 p-3 ring-1 ring-warn-red/20", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-warn-red", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(ShieldAlert, { className: "size-3.5" }),
              "Bite warning signs"
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 text-sm whitespace-pre-line", children: plan.bite_risk })
          ] })
        ] })
      ] }),
      hazards.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Household hazards — keep away", danger: true, children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(DangerChips, { items: hazards }),
        has(plan.hazards_other) && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm whitespace-pre-line text-warn-red", children: plan.hazards_other })
      ] }),
      showHome && /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "Home & safety", children: [
        has(plan.cage_location) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Cage location", value: plan.cage_location }),
        (has(plan.out_of_cage_mode) || has(plan.out_of_cage_notes) || has(plan.out_of_cage_rules)) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Out-of-cage rules", value: [prettyLabel(plan.out_of_cage_mode, OUT_OF_CAGE_LABELS), plan.out_of_cage_notes, plan.out_of_cage_rules].filter(Boolean).join("\n") }),
        (has(plan.off_limits) || has(plan.off_limits_rooms)) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Off-limits areas", value: [plan.off_limits, plan.off_limits_rooms].filter(Boolean).join("\n") }),
        has(plan.safety_rules) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Safety rules", value: plan.safety_rules }),
        has(plan.other_pets) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Other pets", value: plan.other_pets })
      ] }),
      showHealth && /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "What's normal & health", children: [
        weightStr && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Normal weight", value: weightStr }),
        has(plan.whats_normal) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "What's normal (overall)", value: plan.whats_normal }),
        has(plan.normal_appetite) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Normal appetite", value: plan.normal_appetite }),
        has(plan.normal_droppings) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Normal droppings", value: plan.normal_droppings }),
        has(plan.normal_noise) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Normal noise", value: plan.normal_noise }),
        has(plan.normal_activity) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Normal activity", value: plan.normal_activity }),
        has(plan.normal_sleep) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Normal sleep", value: plan.normal_sleep }),
        has(plan.normal_behavior_with_strangers) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "With strangers", value: plan.normal_behavior_with_strangers }),
        has(bird.medical_conditions) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Medical conditions", value: bird.medical_conditions }),
        (has(bird.medications) || has(plan.medication_schedule)) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Medications", value: [bird.medications, plan.medication_schedule].filter(Boolean).join("\n") }),
        (ctx.baselineDroppingsUrl || ctx.baselineClipUrl) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "grid grid-cols-1 gap-2", children: [
          ctx.baselineDroppingsUrl && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-hidden rounded-xl ring-1 ring-[#e0d8c4]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: ctx.baselineDroppingsUrl, alt: "Baseline droppings", className: "aspect-video w-full object-cover" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "bg-white px-2 py-1 text-[11px] font-medium", children: "Baseline droppings" })
          ] }),
          ctx.baselineClipUrl && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "overflow-hidden rounded-xl ring-1 ring-[#e0d8c4]", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(ClipPlayer, { src: ctx.baselineClipUrl, label: "Normal-behavior clip", className: "aspect-video" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "bg-white px-2 py-1 text-[11px] font-medium", children: "Normal-behavior clip" })
          ] })
        ] })
      ] }),
      (has(plan.when_to_call_owner) || has(plan.when_to_call_vet)) && /* @__PURE__ */ jsxRuntimeExports.jsxs(Section, { title: "When to call", danger: true, children: [
        has(plan.when_to_call_owner) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Call the owner", value: plan.when_to_call_owner }),
        has(plan.when_to_call_vet) && /* @__PURE__ */ jsxRuntimeExports.jsx(Field, { label: "Call the vet", value: plan.when_to_call_vet })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "px-1 text-center text-[11px] text-[#5f5e5a]", children: [
        "Owner-provided reference. For general care guidance, see the ",
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/sitter/$token/guide", params: {
          token
        }, className: "underline", children: "Care guide" }),
        "."
      ] })
    ] })
  ] });
}
export {
  CareSheet as component
};
