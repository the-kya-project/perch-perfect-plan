import { r as reactExports, j as jsxRuntimeExports } from "../_libs/react.mjs";
import { L as Link } from "../_libs/tanstack__react-router.mjs";
import { d as Route$9, e as useSitterContext, u as useServerFn, f as toggleTaskCompletion } from "./router-Cu2Tdjxf.mjs";
import { a as useQueryClient, c as useMutation } from "../_libs/tanstack__react-query.mjs";
import { D as Disclaimer } from "./Disclaimer-BfRf9x0C.mjs";
import { C as ClipPlayer } from "./ClipPlayer-TEvTBXF2.mjs";
import "../_libs/sonner.mjs";
import "../_libs/seroval.mjs";
import { g as Calendar, a as ChevronDown, n as Stethoscope, o as BookOpen, j as ChevronRight, H as Hand, V as Volume2 } from "../_libs/lucide-react.mjs";
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
import "./triage-DfSRYuT8.mjs";
const FRESH_FOOD_TASK_PATTERN = /\b(fresh|chop|veg|veggies|salad|sprout)\b/i;
const REMOVAL_TASK_PATTERN = /^remove fresh food/i;
const FEEDING_TASK_PATTERN = /\b(feed|food|pellet|seed|chop|veg|veggies|salad|sprout|fruit|breakfast|dinner|harrison)\b/i;
function loadTimers(sitId, birdId) {
  try {
    const raw = localStorage.getItem(`freshTimers:${sitId}:${birdId}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveTimers(sitId, birdId, t) {
  try {
    localStorage.setItem(`freshTimers:${sitId}:${birdId}`, JSON.stringify(t));
  } catch {
  }
}
const DAYPARTS = ["morning", "midday", "evening", "anytime"];
const DAYPART_LABEL = {
  morning: "Morning",
  midday: "Midday",
  evening: "Evening",
  anytime: "Anytime"
};
const CATEGORY_DAYPART = {
  morning: "morning",
  midday: "midday",
  evening: "evening",
  bedtime: "evening",
  custom: "anytime"
};
function currentDaypart(d) {
  const h = d.getHours();
  if (h < 11) return "morning";
  if (h < 16) return "midday";
  return "evening";
}
function parseTaskMinutes(s) {
  if (!s) return null;
  const m = String(s).toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3];
  if (ap?.startsWith("p") && h < 12) h += 12;
  if (ap?.startsWith("a") && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}
function SitterHome() {
  const {
    token
  } = Route$9.useParams();
  const {
    data: ctx
  } = useSitterContext(token);
  const qc = useQueryClient();
  const toggle = useServerFn(toggleTaskCompletion);
  const sitId = ctx.sit.id;
  const birdId = ctx.activeBirdId;
  const [timers, setTimers] = reactExports.useState(() => loadTimers(sitId, birdId));
  const [expandedIds, setExpandedIds] = reactExports.useState(() => /* @__PURE__ */ new Set());
  function toggleExpanded(id) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  const [expandedSections, setExpandedSections] = reactExports.useState(() => /* @__PURE__ */ new Set());
  function toggleSection(dp) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(dp) ? next.delete(dp) : next.add(dp);
      return next;
    });
  }
  const [, setTick] = reactExports.useState(0);
  reactExports.useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 6e4);
    return () => clearInterval(id);
  }, []);
  reactExports.useEffect(() => {
    setTimers(loadTimers(sitId, birdId));
  }, [sitId, birdId]);
  const m = useMutation({
    mutationFn: (vars) => toggle({
      data: {
        token,
        taskId: vars.taskId,
        completed: vars.completed
      }
    }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: ["sitter-ctx", token]
      });
      const isFresh = FRESH_FOOD_TASK_PATTERN.test(vars.title) && !REMOVAL_TASK_PATTERN.test(vars.title);
      if (!isFresh) return;
      const next = {
        ...timers
      };
      if (vars.completed) {
        next[vars.taskId] = {
          startedAt: Date.now(),
          taskTitle: vars.title
        };
      } else {
        delete next[vars.taskId];
      }
      setTimers(next);
      saveTimers(sitId, birdId, next);
    }
  });
  const completedIds = new Set((ctx.completions ?? []).map((c) => c.routine_task_id));
  reactExports.useEffect(() => {
    let changed = false;
    const next = {
      ...timers
    };
    for (const id of Object.keys(next)) {
      if (!completedIds.has(id)) {
        delete next[id];
        changed = true;
      }
    }
    if (changed) {
      setTimers(next);
      saveTimers(sitId, birdId, next);
    }
  }, [ctx.completions]);
  const byDaypart = {};
  for (const t of ctx.tasks) {
    const dp = CATEGORY_DAYPART[t.category] ?? "anytime";
    (byDaypart[dp] ??= []).push(t);
  }
  for (const dp of Object.keys(byDaypart)) {
    byDaypart[dp].sort((a, b) => {
      const va = parseTaskMinutes(a.time_of_day) ?? 1e9;
      const vb = parseTaskMinutes(b.time_of_day) ?? 1e9;
      return va !== vb ? va - vb : (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }
  const now = /* @__PURE__ */ new Date();
  const nowDp = currentDaypart(now);
  const timeLabel = now.toLocaleTimeString(void 0, {
    hour: "numeric",
    minute: "2-digit"
  });
  const todayLabel = now.toLocaleDateString(void 0, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  const currentList = byDaypart[nowDp] ?? [];
  const currentDone = currentList.filter((t) => completedIds.has(t.id)).length;
  const allCurrentDone = currentList.length > 0 && currentDone === currentList.length;
  const ci = DAYPARTS.indexOf(nowDp);
  const otherSections = DAYPARTS.filter((dp) => dp !== nowDp && (byDaypart[dp]?.length ?? 0) > 0);
  const nextUp = DAYPARTS.find((dp, i) => i > ci && (byDaypart[dp]?.length ?? 0) > 0) ?? null;
  let firstFeedingId = null;
  for (const dp of DAYPARTS) {
    for (const t of byDaypart[dp] ?? []) {
      if (!firstFeedingId && FEEDING_TASK_PATTERN.test(t.title) && !REMOVAL_TASK_PATTERN.test(t.title)) firstFeedingId = t.id;
    }
  }
  function renderTask(t) {
    const done = completedIds.has(t.id);
    const open = expandedIds.has(t.id);
    const detail = typeof t.instructions === "string" ? t.instructions.trim() : "";
    const hasDetail = detail.length > 0;
    const showCaution = t.id === firstFeedingId;
    const showPill = !!t.time_of_day && parseTaskMinutes(t.time_of_day) != null;
    return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "py-2.5 first:pt-0 last:pb-0", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-start gap-3", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => m.mutate({
          taskId: t.id,
          completed: !done,
          title: t.title
        }), className: "flex flex-1 items-start gap-3 text-left", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `mt-0.5 grid size-6 shrink-0 place-items-center rounded border-2 ${done ? "border-warn-green bg-warn-green" : "border-[#bcb6a3] bg-white"}`, children: done && /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 20 20", className: "size-4 text-white", children: /* @__PURE__ */ jsxRuntimeExports.jsx("path", { fill: "currentColor", d: "M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z" }) }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex-1", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex flex-wrap items-center gap-x-2 gap-y-1", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: done ? "text-sm text-sage-400 line-through" : "text-sm font-medium text-sage-900", children: t.title }),
              showPill && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "rounded-full bg-[#e8f0ec] px-2 py-0.5 text-[10px] font-medium text-[#2d6a4f]", children: t.time_of_day })
            ] }),
            showCaution && /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-1 block text-[11px] font-semibold text-warn-amber", children: "Don't introduce new foods while the owner is away." })
          ] })
        ] }),
        hasDetail && /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: () => toggleExpanded(t.id), "aria-expanded": open, "aria-label": open ? "Hide details" : "Show details", className: "grid shrink-0 place-items-center p-1 text-[#8a897f]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: `size-4 transition-transform ${open ? "rotate-180" : ""}` }) })
      ] }),
      hasDetail && open && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-1 pl-9 text-xs leading-relaxed text-sage-600 whitespace-pre-line", children: detail })
    ] }, t.id);
  }
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("main", { className: "mx-auto max-w-md space-y-5 px-4 py-5", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx(WelcomeCard, { bird: ctx.bird, plan: ctx.plan }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex items-center justify-between gap-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "inline-flex items-center gap-1.5 rounded-full bg-[#e8f0ec] px-3 py-1 text-xs font-semibold text-[#2d6a4f]", children: [
        DAYPART_LABEL[nowDp],
        " · ",
        timeLabel
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-1 text-xs text-sage-600", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(Calendar, { className: "size-3.5" }),
        todayLabel
      ] })
    ] }),
    ctx.tasks.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "rounded-2xl bg-[#efe9da] p-4 text-sm text-sage-600", children: "The owner hasn't added any routine tasks yet." }) : /* @__PURE__ */ jsxRuntimeExports.jsxs(jsxRuntimeExports.Fragment, { children: [
      currentList.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-sage-600", children: [
          currentDone,
          " of ",
          currentList.length,
          " done this ",
          nowDp
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sage-100", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "h-full rounded-full bg-[#2d6a4f] transition-all", style: {
          width: `${Math.round(currentDone / currentList.length * 100)}%`
        } }) })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "rounded-2xl border-2 border-[#1a3d2e] bg-white p-4 shadow-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-[10px] font-medium uppercase tracking-widest text-[#1a3d2e]", children: [
          "Due now — ",
          nowDp
        ] }),
        currentList.length === 0 ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-sm text-sage-600", children: [
          "Nothing scheduled for this ",
          nowDp,
          "."
        ] }) : allCurrentDone ? /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-2 text-sm font-medium text-[#2d6a4f]", children: [
          "All done for this ",
          nowDp,
          " — nicely done."
        ] }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 divide-y divide-sage-100", children: currentList.map(renderTask) })
      ] }),
      otherSections.map((dp) => {
        const list = byDaypart[dp] ?? [];
        const done = list.filter((t) => completedIds.has(t.id)).length;
        const open = expandedSections.has(dp);
        return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
          /* @__PURE__ */ jsxRuntimeExports.jsxs("button", { onClick: () => toggleSection(dp), "aria-expanded": open, className: "flex w-full items-center justify-between rounded-2xl bg-[#efe9da] p-4 shadow-sm", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-sm font-medium text-sage-900", children: DAYPART_LABEL[dp] }),
              /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "text-xs text-[#5f5e5a]", children: [
                done,
                "/",
                list.length,
                " done"
              ] })
            ] }),
            /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronDown, { className: `size-5 shrink-0 text-[#8a897f] transition-transform ${open ? "rotate-180" : ""}` })
          ] }),
          !open && dp === nextUp && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "mt-1 truncate px-4 text-xs text-[#5f5e5a]", children: [
            "Next: ",
            list.map((t) => t.title).join(", ")
          ] }),
          open && /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "mt-2 rounded-2xl bg-[#efe9da] px-4 shadow-sm", children: /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "divide-y divide-sage-100 py-2", children: list.map(renderTask) }) })
        ] }, dp);
      })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/sitter/$token/scan", params: {
      token
    }, className: "flex items-stretch overflow-hidden rounded-2xl bg-[#efe9da] shadow-sm active:scale-[0.99]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "w-1.5 shrink-0 bg-[#2d6a4f]" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex flex-1 items-center justify-between gap-3 p-4", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex items-center gap-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "grid size-10 shrink-0 place-items-center rounded-full bg-[#e8f0ec] text-[#2d6a4f]", children: /* @__PURE__ */ jsxRuntimeExports.jsx(Stethoscope, { className: "size-5" }) }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "block", children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-[10px] font-medium uppercase tracking-widest text-sage-500", children: "Daily requirement" }),
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "block text-base font-medium leading-tight text-sage-900", children: "Run today's health scan" }),
            ctx.todayLog && /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "mt-0.5 block text-xs text-sage-600", children: [
              "Latest scan: ",
              /* @__PURE__ */ jsxRuntimeExports.jsx(TriagePill, { status: ctx.todayLog.triage_status })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "shrink-0 rounded-xl bg-[#1a3d2e] px-4 py-2 text-sm font-medium text-white", children: "Start" })
      ] })
    ] }),
    ctx.watchClips && ctx.watchClips.length > 0 && /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "space-y-2", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx("h2", { className: "text-lg font-medium tracking-tight", children: "Watch first" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "text-xs text-sage-600", children: [
        "Short clips from ",
        ctx.bird.name,
        "'s owner. These are private to you."
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1", children: ctx.watchClips.map((c) => /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "flex w-60 shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-[#efe9da] shadow-sm", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx(ClipPlayer, { src: c.url, label: c.label, className: "aspect-video" }),
        /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "p-3", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-sm font-medium leading-tight", children: c.label }),
          /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-[11px] uppercase tracking-wider text-sage-600", children: "Owner-recorded" })
        ] })
      ] }, c.key)) })
    ] }),
    /* @__PURE__ */ jsxRuntimeExports.jsx(Disclaimer, { compact: true }),
    /* @__PURE__ */ jsxRuntimeExports.jsxs(Link, { to: "/sitter/$token/care-sheet", params: {
      token
    }, className: "flex w-full items-center gap-3 rounded-2xl border-2 border-[#1a3d2e] bg-white p-4 text-left active:scale-[0.99]", children: [
      /* @__PURE__ */ jsxRuntimeExports.jsx(BookOpen, { className: "size-5 shrink-0 text-[#1a3d2e]" }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "flex-1", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { className: "block text-base font-medium leading-tight text-[#1a3d2e]", children: [
          "View ",
          ctx.bird.name,
          "'s full care plan"
        ] }),
        /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "mt-0.5 block text-xs text-sage-600", children: "Diet, behavior, home, health — the source of truth" })
      ] }),
      /* @__PURE__ */ jsxRuntimeExports.jsx(ChevronRight, { className: "size-5 shrink-0 text-[#1a3d2e]" })
    ] })
  ] });
}
function TriagePill({
  status
}) {
  const map = {
    green: "bg-warn-green",
    yellow: "bg-warn-amber",
    red: "bg-warn-red"
  };
  return /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: `inline-block size-2 rounded-full ${map[status] ?? "bg-sage-300"}` });
}
function WelcomeCard({
  bird,
  plan
}) {
  const p = plan ?? {};
  const species = (bird.species ?? "").trim() || "Parrot";
  const age = (bird.age ?? "").trim();
  const speciesAge = [species, age].filter(Boolean).join(" · ");
  const intro = (bird.owner_edited_intro ?? bird.sitter_intro ?? p.owner_edited_intro ?? p.sitter_intro ?? "").toString().trim();
  const handling = (p.step_up ?? p.handling_rules ?? "").toString().trim();
  const noise = (p.normal_noise ?? "").toString().trim();
  const initial = (bird.name?.slice(0, 1) ?? "?").toUpperCase();
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("section", { className: "overflow-hidden rounded-2xl bg-[#1a3d2e] text-white", children: [
    /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative aspect-[4/3] w-full bg-white/10", children: [
      bird.photo_url ? /* @__PURE__ */ jsxRuntimeExports.jsx("img", { src: bird.photo_url, alt: bird.name, loading: "lazy", style: {
        objectPosition: bird.photo_position ?? "50% 20%"
      }, className: "absolute inset-0 size-full object-cover" }) : /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "grid size-full place-items-center", children: /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "text-4xl font-semibold text-white/90", children: initial }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsx("div", { className: "absolute inset-x-0 top-0 bg-gradient-to-b from-black/30 to-transparent px-4 pb-8 pt-3", children: /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[10px] font-medium uppercase tracking-widest text-[#cdeab0]", children: "Welcome — here's who you're caring for" }) }),
      /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1a3d2e] via-[#1a3d2e]/70 to-transparent px-5 pb-3 pt-12", children: [
        /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { className: "text-[22px] font-medium leading-tight text-white", children: bird.name }),
        speciesAge && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "mt-0.5 text-sm text-[#cdeab0]", children: speciesAge })
      ] })
    ] }),
    (intro || handling || noise) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-4 p-5", children: [
      intro && /* @__PURE__ */ jsxRuntimeExports.jsx("p", { className: "text-[13px] leading-relaxed text-white/85", children: intro }),
      (handling || noise) && /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "space-y-2", children: [
        handling && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex gap-2 text-sm leading-snug", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Hand, { className: "mt-0.5 size-4 shrink-0 text-[#cdeab0]" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: "Handling:" }),
            " ",
            handling
          ] })
        ] }),
        noise && /* @__PURE__ */ jsxRuntimeExports.jsxs("p", { className: "flex gap-2 text-sm leading-snug", children: [
          /* @__PURE__ */ jsxRuntimeExports.jsx(Volume2, { className: "mt-0.5 size-4 shrink-0 text-[#cdeab0]" }),
          /* @__PURE__ */ jsxRuntimeExports.jsxs("span", { children: [
            /* @__PURE__ */ jsxRuntimeExports.jsx("span", { className: "font-semibold", children: "Noise:" }),
            " ",
            noise
          ] })
        ] })
      ] })
    ] })
  ] });
}
export {
  SitterHome as component
};
