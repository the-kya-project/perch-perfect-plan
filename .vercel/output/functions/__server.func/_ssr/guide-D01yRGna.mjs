import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { u as useSuspenseQuery } from "../_libs/tanstack__react-query.mjs";
import { j as Route$7, e as useSitterContext, u as useServerFn, k as getGuideCards } from "./router-Cu2Tdjxf.mjs";
import "../_libs/sonner.mjs";
import "../_libs/seroval.mjs";
import { r as Star, U as Utensils, s as Smile, t as Heart, T as TriangleAlert, u as House, A as ArrowLeft, v as Search, a as ChevronDown, I as Info, H as Hand, D as Droplet, w as Activity, M as Moon, W as Wind } from "../_libs/lucide-react.mjs";
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
function objectPronoun(sex) {
  const s = (sex ?? "").trim().toLowerCase();
  if (s.startsWith("f")) return "her";
  if (s.startsWith("m")) return "him";
  return "them";
}
const TOPICS = [{
  key: "golden",
  label: "Golden rules",
  icon: Star
}, {
  key: "eating",
  label: "Eating",
  icon: Utensils
}, {
  key: "behavior",
  label: "Behavior",
  icon: Smile
}, {
  key: "health",
  label: "Health",
  icon: Heart
}, {
  key: "worry",
  label: "When to worry",
  icon: TriangleAlert
}, {
  key: "home",
  label: "Home",
  icon: House
}];
const TOPIC_SUBHEAD = {
  golden: "The ones marked watch closely matter most."
};
const CATEGORY_TOPIC = {
  "01-the-10-rules": "golden",
  "02-the-daily-health-scan": "health",
  "03-healthy-vs-sick": "worry",
  "04-droppings": "health",
  "05-body-language": "behavior",
  "06-trust-and-handling": "behavior",
  "07-food-and-water": "eating",
  "08-enrichment": "behavior",
  "09-the-safe-home": "home",
  "10-emergencies": "worry",
  "11-special-situations": "health",
  "12-keeping-the-owner-informed": "health"
};
const ENTRY_TOPIC = {
  "rule-emergency": "worry",
  "rule-doors-windows": "home"
};
function topicForCard(c) {
  return ENTRY_TOPIC[c.slug] ?? CATEGORY_TOPIC[c.category] ?? "golden";
}
function iconForEntry(card) {
  const s = `${card.slug ?? ""} ${card.title ?? ""} ${card.category ?? ""} ${card.search_keywords ?? ""}`.toLowerCase();
  if (/emergenc|first.?aid|gets? out/.test(s)) return TriangleAlert;
  if (/hand|step.?up|handl|bite|perch/.test(s)) return Hand;
  if (/dropping|poop|stool/.test(s)) return Droplet;
  if (/breath|lung|respir|wheez|tail.?bob/.test(s)) return Activity;
  if (/sleep|night|bed|cover|rest/.test(s)) return Moon;
  if (/air|fume|smoke|ventil|teflon|candle|scent|window|door/.test(s)) return Wind;
  if (/eat|food|feed|diet|bowl|water|treat/.test(s)) return Utensils;
  if (/behav|mood|fear|stress|pluck|enrich|toy/.test(s)) return Smile;
  if (/health|sick|ill|weight|vet|molt/.test(s)) return Heart;
  return Star;
}
function EntryIcon({
  card
}) {
  const Icon = iconForEntry(card);
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "grid size-[38px] shrink-0 place-items-center rounded-[11px] bg-[#e2ddcb] text-[#2d6a4f]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Icon, { className: "size-5" }) });
}
function Guide() {
  const {
    token
  } = Route$7.useParams();
  const {
    data: ctx
  } = useSitterContext(token);
  const fn = useServerFn(getGuideCards);
  const {
    data: cards
  } = useSuspenseQuery({
    queryKey: ["guide-cards"],
    queryFn: () => fn()
  });
  const [q, setQ] = reactExports.useState("");
  const [topic, setTopic] = reactExports.useState("golden");
  const [open, setOpen] = reactExports.useState(null);
  const bird = ctx.bird;
  const pron = objectPronoun(bird.sex);
  const searching = q.trim().length > 0;
  const ql = q.trim().toLowerCase();
  const matches = (c) => [c.title, c.category, c.search_keywords, c.quick_answer, c.what_to_check, c.what_to_do, c.when_to_call_vet].filter(Boolean).join(" ").toLowerCase().includes(ql);
  const list = searching ? cards.filter(matches) : cards.filter((c) => topicForCard(c) === topic);
  const activeTopic = TOPICS.find((t) => t.key === topic);
  const isWatch = (c) => c.emergency_level === "red" || c.emergency_level === "yellow";
  const isDroppings = (c) => /dropping|poop|stool/i.test(`${c.slug ?? ""} ${c.title ?? ""} ${c.search_keywords ?? ""}`);
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "min-h-screen bg-[#f4f1e8] pb-28", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("header", { className: "bg-[#1a3d2e] pt-[max(env(safe-area-inset-top),0.75rem)]", children: /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mx-auto max-w-md px-4 pb-5 pt-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/sitter/$token", params: {
          token
        }, className: "-ml-1 rounded-full p-1 text-white/90 hover:bg-white/10", "aria-label": "Back", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ArrowLeft, { className: "size-5" }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-lg font-medium text-white", children: "Care guide" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-sm leading-relaxed text-[#cdeab0]", children: [
        "The why behind the what. ",
        bird.name,
        "'s care sheet is the source of truth for ",
        pron,
        " — this is here when you want to understand something."
      ] })
    ] }) }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-4 px-4 py-5", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Search, { className: "absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#8a897f]" }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("input", { value: q, onChange: (e) => setQ(e.target.value), placeholder: "What do you need to know?", className: "w-full rounded-2xl border border-[#e0d8c4] bg-[#efe9da] py-3.5 pl-12 pr-4 text-sm text-[#1a3d2e] outline-none placeholder:text-[#8a897f] focus:border-[#2d6a4f]" })
      ] }),
      !searching && /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", children: TOPICS.map((t) => {
          const on = topic === t.key;
          const CIcon = t.icon;
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setTopic(t.key), "aria-pressed": on, className: `flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${on ? "bg-[#1a3d2e] text-white" : "bg-[#efe9da] text-[#1a3d2e]"}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx(CIcon, { className: "size-3.5" }),
            t.label
          ] }, t.key);
        }) }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[11px] font-medium uppercase tracking-widest text-[#8a897f]", children: activeTopic?.label }),
          TOPIC_SUBHEAD[topic] && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-xs text-[#5f5e5a]", children: TOPIC_SUBHEAD[topic] })
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2.5", children: [
        list.map((c) => {
          const watch = isWatch(c);
          const isOpen = open === c.id;
          const hasDeeper = !!(c.what_to_check || c.what_to_do || c.when_to_call_vet);
          return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: `overflow-hidden bg-[#efe9da] ${watch ? "rounded-2xl rounded-l-none border-l-[3px] border-[#BA7517]" : "rounded-2xl"}`, children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => setOpen(isOpen ? null : c.id), "aria-expanded": isOpen, className: "flex w-full items-center gap-3 p-3 text-left", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx(EntryIcon, { card: c }),
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "flex-1 text-sm font-medium text-[#1a3d2e]", children: c.title }),
              watch && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 rounded-full bg-[#f4e4c4] px-2 py-0.5 text-[10px] font-medium text-[#84600f]", children: "watch closely" }),
              /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: `size-4 shrink-0 text-[#8a897f] transition-transform ${isOpen ? "rotate-180" : ""}` })
            ] }),
            isOpen && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "px-3 pb-4 pl-[3.75rem]", children: [
              c.quick_answer && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm leading-relaxed text-[#3a3a36]", children: c.quick_answer }),
              hasDeeper && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "mt-3 space-y-2 border-t border-[#e0d8c4] pt-3 text-sm leading-relaxed text-[#3a3a36]", children: [
                c.what_to_check && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-[#1a3d2e]", children: "What to check:" }),
                  " ",
                  c.what_to_check
                ] }),
                c.what_to_do && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-[#1a3d2e]", children: "What to do:" }),
                  " ",
                  c.what_to_do
                ] }),
                c.when_to_call_vet && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { children: [
                  /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-medium text-[#1a3d2e]", children: "When to call the vet:" }),
                  " ",
                  c.when_to_call_vet
                ] })
              ] }),
              isDroppings(c) && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-3 text-xs leading-relaxed text-[#5f5e5a]", children: [
                "If unsure, snap a photo for the owner in the",
                " ",
                /* @__PURE__ */ jsxRuntimeExports.jsx(Link, { to: "/sitter/$token/scan", params: {
                  token
                }, className: "font-medium text-[#2d6a4f] underline", children: "health scan" }),
                "."
              ] })
            ] })
          ] }, c.id);
        }),
        list.length === 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "px-1 text-sm text-[#5f5e5a]", children: [
          "No entries match “",
          q,
          "”."
        ] })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex items-start gap-1.5 px-1 pt-2 text-[11px] leading-snug text-[#8a897f]", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Info, { className: "mt-px size-3.5 shrink-0 text-[#BA7517]" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
          "General guidance, not vet-reviewed. For anything urgent, use ",
          bird.name,
          "'s emergency info."
        ] })
      ] })
    ] })
  ] });
}
export {
  Guide as component
};
