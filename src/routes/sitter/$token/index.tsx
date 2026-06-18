import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSitterContext } from "./route";
import { toggleTaskCompletion } from "@/lib/sitter.functions";
import { Disclaimer } from "@/components/Disclaimer";
import { BrandLogo } from "@/components/BrandLogo";
import { Stethoscope, Calendar, Clock, X, BookOpen, ChevronRight, ChevronDown } from "lucide-react";
import { ClipPlayer } from "@/components/ClipPlayer";

export const Route = createFileRoute("/sitter/$token/")({
  component: SitterHome,
});

const FRESH_FOOD_TASK_PATTERN = /\b(fresh|chop|veg|veggies|salad|sprout)\b/i;
const REMOVAL_TASK_PATTERN = /^remove fresh food/i;
// Used only to attach the one-line "don't introduce new foods" caution to the
// first feeding item on the Today tab. Removal tasks are excluded.
const FEEDING_TASK_PATTERN = /\b(feed|food|pellet|seed|chop|veg|veggies|salad|sprout|fruit|breakfast|dinner|harrison)\b/i;

type FreshTimer = { startedAt: number; taskTitle: string };

function loadTimers(sitId: string, birdId: string): Record<string, FreshTimer> {
  try {
    const raw = localStorage.getItem(`freshTimers:${sitId}:${birdId}`);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveTimers(sitId: string, birdId: string, t: Record<string, FreshTimer>) {
  try { localStorage.setItem(`freshTimers:${sitId}:${birdId}`, JSON.stringify(t)); } catch {}
}
function fmtTime(ms: number) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

const CATS = ["morning", "midday", "evening", "bedtime", "custom"] as const;

function SitterHome() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const qc = useQueryClient();
  const toggle = useServerFn(toggleTaskCompletion);

  const sitId = ctx.sit.id;
  const birdId = ctx.activeBirdId;
  const removalMinutes = (ctx.plan?.fresh_food_removal_minutes ?? 120) as number;

  const [timers, setTimers] = useState<Record<string, FreshTimer>>(() => loadTimers(sitId, birdId));
  // Per-item expandable detail on the checklist (collapsed by default).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  // Re-render every 30s so countdowns and "Time to remove" surfaces update.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  // Reload timers if the active bird changes.
  useEffect(() => { setTimers(loadTimers(sitId, birdId)); }, [sitId, birdId]);

  const m = useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean; title: string }) =>
      toggle({ data: { token, taskId: vars.taskId, completed: vars.completed } }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["sitter-ctx", token] });
      // Manage the fresh-food removal timer.
      const isFresh = FRESH_FOOD_TASK_PATTERN.test(vars.title) && !REMOVAL_TASK_PATTERN.test(vars.title);
      if (!isFresh) return;
      const next = { ...timers };
      if (vars.completed) {
        next[vars.taskId] = { startedAt: Date.now(), taskTitle: vars.title };
      } else {
        delete next[vars.taskId];
      }
      setTimers(next);
      saveTimers(sitId, birdId, next);
    },
  });

  function dismissTimer(taskId: string) {
    const next = { ...timers };
    delete next[taskId];
    setTimers(next);
    saveTimers(sitId, birdId, next);
  }

  const completedIds = new Set((ctx.completions ?? []).map((c: any) => c.routine_task_id));
  // Drop timers for tasks no longer completed (e.g. unchecked elsewhere).
  useEffect(() => {
    let changed = false;
    const next = { ...timers };
    for (const id of Object.keys(next)) {
      if (!completedIds.has(id)) { delete next[id]; changed = true; }
    }
    if (changed) { setTimers(next); saveTimers(sitId, birdId, next); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.completions]);

  const grouped: Record<string, any[]> = {};
  for (const t of ctx.tasks) (grouped[t.category] ??= []).push(t);
  const todayLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  // The first feeding item carries the one "don't introduce new foods" caution,
  // in chronological (category) order. Removal tasks are not feeding items.
  let firstFeedingId: string | null = null;
  for (const cat of CATS) {
    for (const t of grouped[cat] ?? []) {
      if (!firstFeedingId && FEEDING_TASK_PATTERN.test(t.title) && !REMOVAL_TASK_PATTERN.test(t.title)) {
        firstFeedingId = t.id;
      }
    }
  }

  const now = Date.now();
  const activeTimers = Object.entries(timers).map(([taskId, t]) => {
    const dueAt = t.startedAt + removalMinutes * 60_000;
    return { taskId, ...t, dueAt, isDue: now >= dueAt };
  });

  return (
    <>
      <header className="border-b border-sage-100 bg-white">
        <div className="mx-auto max-w-md px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo size="sm" showTagline={false} />
            <div className="rounded bg-sage-50 px-2 py-1 text-[10px] font-bold uppercase">Sit active</div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-full bg-sage-100 font-bold text-sage-700">
              {ctx.bird.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h1 className="text-sm font-semibold">Care for {ctx.bird.name}</h1>
              <p className="text-[11px] uppercase tracking-wider text-sage-600">{ctx.bird.species ?? "Parrot"}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-4 py-5">
        <Disclaimer compact />

        <Link
          to="/sitter/$token/scan" params={{ token }}
          className="flex items-center justify-between rounded-2xl bg-sage-900 p-5 text-white shadow-sm active:scale-[0.99]"
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest opacity-70">Daily requirement</p>
            <p className="mt-1 text-lg font-semibold">Run today's health scan</p>
            {ctx.todayLog && <p className="mt-1 text-xs opacity-80">Latest scan: <TriagePill status={ctx.todayLog.triage_status} /></p>}
          </div>
          <div className="rounded-full bg-white/10 p-3"><Stethoscope className="size-5" /></div>
        </Link>

        <Link
          to="/sitter/$token/care-sheet" params={{ token }}
          className="flex items-center justify-between rounded-2xl bg-white p-5 ring-1 ring-sage-200 shadow-sm active:scale-[0.99]"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-sage-100 p-2.5 text-sage-700"><BookOpen className="size-5" /></div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-sage-600">Source of truth</p>
              <p className="mt-0.5 text-base font-semibold leading-tight">{ctx.bird.name}'s full care plan</p>
              <p className="mt-0.5 text-xs text-sage-600">Everything the owner wants you to know.</p>
            </div>
          </div>
          <ChevronRight className="size-5 text-sage-400" />
        </Link>

        {ctx.watchClips && ctx.watchClips.length > 0 && (
          <section className="space-y-2">
            <h2 className="text-lg font-bold tracking-tight">Watch first</h2>
            <p className="text-xs text-sage-600">Short clips from {ctx.bird.name}'s owner. These are private to you.</p>
            <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1">
              {ctx.watchClips.map((c: any) => (
                <div
                  key={c.key}
                  className="flex w-60 shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-sage-100 shadow-sm"
                >
                  <ClipPlayer src={c.url} label={c.label} className="aspect-video" />
                  <div className="p-3">
                    <p className="text-sm font-semibold leading-tight">{c.label}</p>
                    <p className="mt-0.5 text-[11px] uppercase tracking-wider text-sage-600">Owner-recorded</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}


        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-lg font-bold tracking-tight">Today's routine</h2>
            <span className="flex items-center gap-1 text-xs text-sage-600"><Calendar className="size-3.5" />{todayLabel}</span>
          </div>
          {ctx.tasks.length === 0 && <p className="rounded-xl bg-white p-4 text-sm text-sage-600 ring-1 ring-sage-100">The owner hasn't added any routine tasks yet.</p>}
          {CATS.map((cat) => grouped[cat]?.length ? (
            <div key={cat} className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-sage-600">{cat}</p>
              {grouped[cat].map((t: any) => {
                const done = completedIds.has(t.id);
                const open = expandedIds.has(t.id);
                const detail = typeof t.instructions === "string" ? t.instructions.trim() : "";
                const hasDetail = detail.length > 0;
                const showCaution = t.id === firstFeedingId;
                return (
                  <div
                    key={t.id}
                    className={`rounded-xl ring-1 transition ${done ? "bg-sage-50 ring-sage-100 opacity-70" : "bg-white ring-sage-100 shadow-sm"}`}
                  >
                    <div className="flex items-stretch">
                      <button
                        onClick={() => m.mutate({ taskId: t.id, completed: !done, title: t.title })}
                        className="flex flex-1 items-start gap-4 p-4 text-left"
                      >
                        <div className={`mt-0.5 size-6 shrink-0 rounded border-2 ${done ? "border-warn-green bg-warn-green" : "border-sage-200 bg-white"} grid place-items-center`}>
                          {done && <svg viewBox="0 0 20 20" className="size-4 text-white"><path fill="currentColor" d="M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z"/></svg>}
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-semibold ${done && "line-through"}`}>{t.title}{t.time_of_day && <span className="ml-2 text-[10px] font-normal uppercase text-sage-600">{t.time_of_day}</span>}</p>
                          {showCaution && <p className="mt-1 text-[11px] font-semibold text-warn-amber">Don't introduce new foods while the owner is away.</p>}
                        </div>
                      </button>
                      {hasDetail && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(t.id)}
                          aria-expanded={open}
                          aria-label={open ? "Hide details" : "Show details"}
                          className="grid shrink-0 place-items-center px-3 text-sage-400"
                        >
                          <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                      )}
                    </div>
                    {hasDetail && open && (
                      <p className="-mt-1 pb-4 pl-14 pr-4 text-xs leading-relaxed text-sage-600 whitespace-pre-line">{detail}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : null)}
        </section>
      </main>
    </>
  );
}

function TriagePill({ status }: { status: string }) {
  const map: Record<string, string> = { green: "bg-warn-green", yellow: "bg-warn-amber", red: "bg-warn-red" };
  return <span className={`inline-block size-2 rounded-full ${map[status] ?? "bg-sage-300"}`} />;
}
