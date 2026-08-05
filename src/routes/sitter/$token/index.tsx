import { createFileRoute, Link, Navigate, useSearch } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useSitterContext } from "./route";
import { toggleTaskCompletion } from "@/lib/sitter.functions";
import { Disclaimer } from "@/components/Disclaimer";
import { Stethoscope, Calendar, BookOpen, ChevronRight, ChevronDown, HeartCrack } from "lucide-react";
import { ClipPlayer } from "@/components/ClipPlayer";
import { taskDaypart, hourToDaypart, DAYPARTS, DAYPART_LABEL, type Daypart } from "@/lib/routineTasks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/sitter/$token/")({
  component: SitterHome,
});

const FRESH_FOOD_TASK_PATTERN = /\b(fresh|chop|veg|veggies|salad|sprout)\b/i;
const REMOVAL_TASK_PATTERN = /^remove fresh food/i;
// Attaches the one-line "don't introduce new foods" caution to the first
// feeding item. Removal tasks are excluded.
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

// Day-part structure for the now-focused Today tab. Placement uses the shared
// taskDaypart() so the sitter checklist and the owner Routine tab always agree.
function currentDaypart(d: Date): Daypart {
  return hourToDaypart(d.getHours());
}

// Parse a free-text time ("4 p.m.", "8 am", "7:30", "Available all day") to
// minutes-since-midnight for chronological sorting; null when there's no time.
function parseTaskMinutes(s: string | null | undefined): number | null {
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
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const { birdId } = useSearch({ from: "/sitter/$token" });
  // Multi-bird sits land on the Home tab until a bird is picked; the Today nav
  // item always carries a birdId, so this only fires on the initial open.
  // Single-bird sits go straight to that bird's Today.
  if (ctx.birds.length > 1 && !birdId) return <Navigate to="/sitter/$token/home" params={{ token }} />;
  return <SitterToday />;
}

// Literal-key daypart labels (not a dynamic `daypart.${dp}` key) so i18next-parser
// can extract them statically. Capitalized for chips/headers; call .toLowerCase()
// for mid-sentence use so English reads "done this morning" exactly as before.
function useDaypartLabel() {
  const { t } = useTranslation();
  return (dp: string, fallback: string): string => {
    switch (dp) {
      case "morning": return t("sitter.today.daypart.morning", "Morning");
      case "midday": return t("sitter.today.daypart.midday", "Midday");
      case "evening": return t("sitter.today.daypart.evening", "Evening");
      case "anytime": return t("sitter.today.daypart.anytime", "Anytime");
      default: return fallback;
    }
  };
}

function SitterToday() {
  const { t, i18n } = useTranslation();
  const daypartLabel = useDaypartLabel();
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const qc = useQueryClient();
  const toggle = useServerFn(toggleTaskCompletion);

  const sitId = ctx.sit.id;
  const birdId = ctx.activeBirdId;

  const [timers, setTimers] = useState<Record<string, FreshTimer>>(() => loadTimers(sitId, birdId));
  // Per-item expandable detail (collapsed by default).
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }
  // Manually expanded/collapsed daypart sections (overrides the time-of-day default).
  const [expandedSections, setExpandedSections] = useState<Set<Daypart>>(() => new Set());
  function toggleSection(dp: Daypart) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      next.has(dp) ? next.delete(dp) : next.add(dp);
      return next;
    });
  }
  // Re-render every minute so the current daypart / time stay accurate.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  // Reload timers if the active bird changes.
  useEffect(() => { setTimers(loadTimers(sitId, birdId)); }, [sitId, birdId]);

  const m = useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean; title: string }) =>
      toggle({ data: { token, taskId: vars.taskId, completed: vars.completed } }),
    // OPTIMISTIC: flip the checkbox instantly by patching ctx.completions in the
    // cache, then sync in the background. The old flow waited for the toggle
    // round trip AND a full sitter-context refetch (a 15-call waterfall) before
    // the check appeared — 1-3s of lag per tap on mobile.
    onMutate: (vars) => {
      const prev = qc.getQueriesData({ queryKey: ["sitter-ctx", token] });
      qc.setQueriesData({ queryKey: ["sitter-ctx", token] }, (old: any) => {
        if (!old?.completions) return old;
        const completions = vars.completed
          ? [...old.completions, { routine_task_id: vars.taskId, sit_id: old.sit?.id }]
          : old.completions.filter((c: any) => c.routine_task_id !== vars.taskId);
        return { ...old, completions };
      });
      return { prev };
    },
    onError: (_e, _vars, mctx) => {
      // Roll the checkbox back and say so — never leave a silent mismatch.
      mctx?.prev?.forEach(([key, data]) => qc.setQueryData(key as any, data));
      toast.error(t("sitter.today.saveFailed", "That didn't save. Please tap it again."));
    },
    onSuccess: (_data, vars) => {
      // Cache is already correct (optimistic patch + confirmed write): no
      // context refetch. Mark the multi-bird dashboard stale so its done-counts
      // refresh on next visit (inactive query — marking stale costs nothing now).
      qc.invalidateQueries({ queryKey: ["sitter-dashboard", token], refetchType: "inactive" });
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

  // Group tasks by daypart, then sort chronologically within each group: timed
  // items by their time, untimed items after (by sort order). Fixes the
  // out-of-order bug for timed items within a section.
  const byDaypart: Record<string, any[]> = {};
  for (const t of ctx.tasks) {
    const dp = taskDaypart(t);
    (byDaypart[dp] ??= []).push(t);
  }
  for (const dp of Object.keys(byDaypart)) {
    byDaypart[dp].sort((a, b) => {
      const va = parseTaskMinutes(a.time_of_day) ?? 1e9;
      const vb = parseTaskMinutes(b.time_of_day) ?? 1e9;
      return va !== vb ? va - vb : (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
  }

  const now = new Date();
  const nowDp = currentDaypart(now);
  const dloc = i18n.language === "nl" ? "nl-NL" : undefined;
  const timeLabel = now.toLocaleTimeString(dloc, { hour: "numeric", minute: "2-digit" });
  const todayLabel = now.toLocaleDateString(dloc, { month: "short", day: "numeric", year: "numeric" });

  const currentList = byDaypart[nowDp] ?? [];
  const currentDone = currentList.filter((t) => completedIds.has(t.id)).length;
  const allCurrentDone = currentList.length > 0 && currentDone === currentList.length;

  const ci = DAYPARTS.indexOf(nowDp);
  const otherSections = DAYPARTS.filter((dp) => dp !== nowDp && (byDaypart[dp]?.length ?? 0) > 0);
  const nextUp = DAYPARTS.find((dp, i) => i > ci && (byDaypart[dp]?.length ?? 0) > 0) ?? null;

  // First feeding item in chronological order carries the new-foods caution.
  let firstFeedingId: string | null = null;
  for (const dp of DAYPARTS) {
    for (const t of byDaypart[dp] ?? []) {
      if (!firstFeedingId && FEEDING_TASK_PATTERN.test(t.title) && !REMOVAL_TASK_PATTERN.test(t.title)) firstFeedingId = t.id;
    }
  }

  function renderTask(task: any) {
    const done = completedIds.has(task.id);
    const open = expandedIds.has(task.id);
    const detail = typeof task.instructions === "string" ? task.instructions.trim() : "";
    const hasDetail = detail.length > 0;
    const showCaution = task.id === firstFeedingId;
    const showPill = !!task.time_of_day && parseTaskMinutes(task.time_of_day) != null;
    return (
      <div key={task.id} className="py-2.5 first:pt-0 last:pb-0">
        <div className="flex items-start gap-3">
          <button
            onClick={() => m.mutate({ taskId: task.id, completed: !done, title: task.title })}
            className="flex flex-1 items-start gap-3 text-left"
          >
            <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded border-2 ${done ? "border-warn-green bg-warn-green" : "border-[#bcb6a3] bg-white"}`}>
              {done && <svg viewBox="0 0 20 20" className="size-4 text-white"><path fill="currentColor" d="M7.629 13.314 4.4 10.085l1.214-1.214 2.015 2.015 5.757-5.757 1.214 1.214z"/></svg>}
            </span>
            <span className="flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={done ? "text-sm text-sage-400 line-through" : "text-sm font-medium text-sage-900"}>{task.title}</span>
                {showPill && <span className="rounded-full bg-[#e8f0ec] px-2 py-0.5 text-[10px] font-medium text-[#2d6a4f]">{task.time_of_day}</span>}
              </span>
              {showCaution && <span className="mt-1 block text-[11px] font-semibold text-warn-amber">{t("sitter.today.noNewFoods", "Don't introduce new foods while the owner is away.")}</span>}
            </span>
          </button>
          {hasDetail && (
            <button
              type="button"
              onClick={() => toggleExpanded(task.id)}
              aria-expanded={open}
              aria-label={open ? t("sitter.today.hideDetails", "Hide details") : t("sitter.today.showDetails", "Show details")}
              className="grid shrink-0 place-items-center p-1 text-[#8a897f]"
            >
              <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
        {hasDetail && open && (
          <p className="mt-1 pl-9 text-xs leading-relaxed text-sage-600 whitespace-pre-line">{detail}</p>
        )}
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-md space-y-5 px-5 py-5">
      <WelcomeCard bird={ctx.bird} token={token} />

      <ScanCard bird={ctx.bird} todayLog={ctx.todayLog} token={token} />

      {/* Today header: daypart chip + date */}
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f0ec] px-3 py-1 text-xs font-semibold text-[#2d6a4f]">
          {daypartLabel(nowDp, DAYPART_LABEL[nowDp])} · {timeLabel}
        </span>
        <span className="flex items-center gap-1 text-xs text-sage-600"><Calendar className="size-3.5" />{todayLabel}</span>
      </div>

      {(ctx as any).remindersPaused ? (
        <p className="rounded-2xl bg-[#efe9da] p-4 text-sm text-sage-600">{t("sitter.today.remindersPaused", "{{name}}'s reminders are paused.", { name: ctx.bird.name })}</p>
      ) : ctx.tasks.length === 0 ? (
        <p className="rounded-2xl bg-[#efe9da] p-4 text-sm text-sage-600">{t("sitter.today.noTasks", "The owner hasn't added any routine tasks yet.")}</p>
      ) : (
        <>
          {/* Progress for the current daypart */}
          {currentList.length > 0 && (
            <div>
              <p className="text-xs text-sage-600">{t("sitter.today.doneThisDaypart", "{{done}} of {{total}} daily tasks done this {{daypart}}", { done: currentDone, total: currentList.length, daypart: daypartLabel(nowDp, DAYPART_LABEL[nowDp]).toLowerCase() })}</p>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sage-100">
                <div className="h-full rounded-full bg-[#2d6a4f] transition-all" style={{ width: `${Math.round((currentDone / currentList.length) * 100)}%` }} />
              </div>
            </div>
          )}

          {/* Due-now card — the one heavily-bordered element on screen */}
          <section data-coach="daily-checklist" className="rounded-2xl border-2 border-[#1a3d2e] bg-white p-4 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-widest text-[#1a3d2e]">{t("sitter.today.dueNow", "Due now — {{daypart}}", { daypart: daypartLabel(nowDp, DAYPART_LABEL[nowDp]).toLowerCase() })}</p>
            {currentList.length === 0 ? (
              <p className="mt-2 text-sm text-sage-600">{t("sitter.today.nothingScheduled", "Nothing scheduled for this {{daypart}}.", { daypart: daypartLabel(nowDp, DAYPART_LABEL[nowDp]).toLowerCase() })}</p>
            ) : allCurrentDone ? (
              <p className="mt-2 text-sm font-medium text-[#2d6a4f]">{t("sitter.today.allDone", "All done for this {{daypart}} — nicely done.", { daypart: daypartLabel(nowDp, DAYPART_LABEL[nowDp]).toLowerCase() })}</p>
            ) : (
              <div className="mt-2 divide-y divide-sage-100">
                {currentList.map(renderTask)}
              </div>
            )}
          </section>

          {/* Other daypart sections — collapsed by default */}
          {otherSections.map((dp) => {
            const list = byDaypart[dp] ?? [];
            const done = list.filter((t) => completedIds.has(t.id)).length;
            const open = expandedSections.has(dp);
            return (
              <div key={dp}>
                <button
                  onClick={() => toggleSection(dp)}
                  aria-expanded={open}
                  className="flex w-full items-center justify-between rounded-2xl bg-[#efe9da] p-4 shadow-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium text-sage-900">{daypartLabel(dp, DAYPART_LABEL[dp])}</span>
                    <span className="text-xs text-[#5f5e5a]">{t("sitter.today.doneCount", "{{done}}/{{total}} done", { done, total: list.length })}</span>
                  </span>
                  <ChevronDown className={`size-5 shrink-0 text-[#8a897f] transition-transform ${open ? "rotate-180" : ""}`} />
                </button>
                {!open && dp === nextUp && (
                  <p className="mt-1 truncate px-4 text-xs text-[#5f5e5a]">{t("sitter.today.next", "Next:")} {list.map((task) => task.title).join(", ")}</p>
                )}
                {open && (
                  <div className="mt-2 rounded-2xl bg-[#efe9da] px-4 shadow-sm">
                    <div className="divide-y divide-sage-100 py-2">
                      {list.map(renderTask)}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {/* Tips from the owner — owner-recorded clips */}
      {ctx.watchClips && ctx.watchClips.length > 0 && (
        <section data-coach="owner-tips" className="space-y-2">
          <h2 className="text-lg font-medium tracking-tight">{t("sitter.today.tipsTitle", "Tips from the owner")}</h2>
          <p className="text-xs text-sage-600">{t("sitter.today.tipsSubtitle", "See how it's done — short clips from {{name}}'s owner, private to you.", { name: ctx.bird.name })}</p>
          <div className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-1">
            {ctx.watchClips.map((c: any) => (
              <div
                key={c.key}
                className="flex w-60 shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-[#efe9da] shadow-sm"
              >
                <ClipPlayer src={c.url} label={c.label} className="aspect-video" />
                <div className="p-3">
                  <p className="text-sm font-medium leading-tight">{c.label}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-sage-600">{t("sitter.today.ownerRecorded", "Owner-recorded")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Disclaimer compact />

      {/* Full care plan — final, quieter outlined action */}
      <Link
        to="/sitter/$token/care-sheet" params={{ token }}
        className="flex w-full items-center gap-3 rounded-2xl border-2 border-[#1a3d2e] bg-white p-4 text-left active:scale-[0.99]"
      >
        <BookOpen className="size-5 shrink-0 text-[#1a3d2e]" />
        <span className="flex-1">
          <span className="block text-base font-medium leading-tight text-[#1a3d2e]">{t("sitter.today.viewCarePlan", "View {{name}}'s full care plan", { name: ctx.bird.name })}</span>
          <span className="mt-0.5 block text-xs text-sage-600">{t("sitter.today.carePlanSubtitle", "Diet, behavior, home, health — the source of truth")}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-[#1a3d2e]" />
      </Link>

      {/* Something's wrong — quiet, last on the page. Opens the pause + guidance
          flow (call the owner, pause this bird's reminders). Never marks the
          bird as passed; only the owner can do that. */}
      <div>
        <Link
          to="/sitter/$token/concern" params={{ token }}
          className="flex w-full items-center gap-3 rounded-2xl border border-[#e0d8c4] bg-white p-4 text-left active:scale-[0.99]"
        >
          <HeartCrack className="size-5 shrink-0 text-sage-600" />
          <span className="flex-1 text-sm font-medium text-[#1a3d2e]">{t("sitter.today.somethingWrong", "Something's wrong with {{name}}", { name: ctx.bird.name })}</span>
          <ChevronRight className="size-4 shrink-0 text-sage-600" />
        </Link>
        <p className="mt-1.5 px-1 text-xs text-sage-600">{t("sitter.today.somethingWrongHint", "If {{name}} has passed or is in serious trouble", { name: ctx.bird.name })}</p>
      </div>
    </main>
  );
}

// Prominent, status-aware entry to the per-bird daily scan. This is the sole
// entry point to the scan now that it's not a nav tab, so it stays unmissable
// and shows today's done/not-done state at a glance (amber = not done yet,
// green = done; red/amber if today's scan was flagged).
function ScanCard({ bird, todayLog, token }: { bird: any; todayLog: any; token: string }) {
  const { t } = useTranslation();
  const done = !!todayLog;
  const status = (todayLog?.triage_status ?? "") as string;
  const flagged = status === "red" || status === "yellow";
  const accent = !done ? "amber" : status === "red" ? "red" : flagged ? "amber" : "green";
  const styles = {
    green: { wrap: "border-warn-green bg-warn-green/5", chip: "bg-warn-green/15 text-warn-green" },
    amber: { wrap: "border-warn-amber bg-warn-amber/5", chip: "bg-warn-amber/15 text-warn-amber" },
    red: { wrap: "border-warn-red bg-warn-red/5", chip: "bg-warn-red/15 text-warn-red" },
  }[accent];
  const heading = !done
    ? t("sitter.today.scanNotDone", "Today's health check — not done yet")
    : flagged
    ? t("sitter.today.scanFlagged", "Health check done — flagged for review")
    : t("sitter.today.scanDone", "Health check done today ✓");
  return (
    <Link
      to="/sitter/$token/scan"
      params={{ token }}
      data-coach="scan-card"
      className={`flex items-center gap-3 rounded-2xl border-2 ${styles.wrap} p-4 shadow-sm active:scale-[0.99]`}
    >
      <span className={`grid size-11 shrink-0 place-items-center rounded-full ${styles.chip}`}>
        <Stethoscope className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-sage-500">{t("sitter.today.scanLabel", "Daily health check · {{name}}", { name: bird.name })}</span>
        <span className="block text-base font-medium leading-tight text-sage-900">{heading}</span>
      </span>
      <span className="shrink-0 rounded-xl bg-[#1a3d2e] px-4 py-2 text-sm font-medium text-white">{done ? t("sitter.today.redo", "Redo") : t("sitter.today.start", "Start")}</span>
    </Link>
  );
}

// Permanent identity card at the top of the sitter Today tab. Always shown,
// full size, for the active bird. FACTS ONLY — name + species/age. No generated
// prose: paraphrasing the care plan into sentences flattened/contradicted the
// owner's actual input (e.g. step-up "yes" + "Only I can handle" rendered as
// "happy to step up onto a familiar hand" — a safety bug). The owner's exact
// words live in the structured "Full care plan" view this card links to.
function WelcomeCard({ bird, token }: { bird: any; token: string }) {
  const { t } = useTranslation();
  const species = (bird.species ?? "").trim() || t("sitter.today.speciesDefault", "Parrot");
  const age = (bird.age ?? "").trim();
  const speciesAge = [species, age].filter(Boolean).join(" · ");
  const initial = (bird.name?.slice(0, 1) ?? "?").toUpperCase();

  return (
    <Link
      to="/sitter/$token/care-sheet"
      params={{ token }}
      data-coach="welcome-card"
      className="block overflow-hidden rounded-2xl bg-[#1a3d2e] text-white active:scale-[0.99]"
    >
      {/* Photo hero — 4:3 keeps a vertical bird subject in frame; the crop
          biases toward the top (head/face) unless the owner set a focal point.
          Bird name is overlaid on a bottom gradient. */}
      <div className="relative aspect-[4/3] w-full bg-white/10">
        {bird.photo_url ? (
          <img
            src={bird.photo_url}
            alt={bird.name}
            loading="lazy"
            style={{ objectPosition: bird.photo_position ?? "50% 20%" }}
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center">
            <span className="text-4xl font-semibold text-white/90">{initial}</span>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/30 to-transparent px-4 pb-8 pt-3">
          <p className="text-[10px] font-medium uppercase tracking-widest text-[#cdeab0]">{t("sitter.today.sayHi", "Say hi to who you're caring for")}</p>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1a3d2e] via-[#1a3d2e]/70 to-transparent px-5 pb-3 pt-12">
          <h1 className="text-[22px] font-medium leading-tight text-white">{bird.name}</h1>
          {speciesAge && <p className="mt-0.5 text-sm text-[#cdeab0]">{speciesAge}</p>}
        </div>
      </div>

      {/* Visible CTA so it's clearly an action, for sitters who don't tap the card. */}
      <div data-coach="care-plan-link" className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
        <span className="text-sm font-medium text-[#cdeab0]">{t("sitter.today.viewCarePlan", "View {{name}}'s full care plan", { name: bird.name })}</span>
        <ChevronRight className="size-5 shrink-0 text-[#cdeab0]" />
      </div>
    </Link>
  );
}
