import { createFileRoute, Link, Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { speciesLabel } from "@/lib/speciesLabel";
import { birdAgeLabel } from "@/lib/birdAge";
import { clipSlotLabel } from "@/lib/clipSlotLabels";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import { useSitterContext } from "./route";
import { toggleTaskCompletion } from "@/lib/sitter.functions";
import { isOwnerPreview } from "@/lib/sitterPreviewMode";
import { ChevronRight, ChevronDown, Check, ArrowRight } from "lucide-react";
import { ClipPlayer } from "@/components/ClipPlayer";
import { taskDaypart, hourToDaypart, parseTaskMinutes, DAYPARTS, DAYPART_LABEL, type Daypart } from "@/lib/routineTasks";
import { renderDerivedTask } from "@/lib/routineTaskRender";
import type { DerivedTask } from "@/lib/derivedTasks";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { localDateISO } from "@/lib/localDay";
import { K, SERIF, KyaBody, KyaCard, KyaHeading } from "@/components/kya";
import { SitterTabHeader } from "@/components/sitter/SitterChrome";
import {
  AroundHouseCard, BirdAvatar, VetNote, WalkthroughPill, isBirdPreview,
  greeting, ownerFirstName, sitLine, sitterFirstName, useSitterShell,
} from "@/components/sitter/sitterShared";
import { useSitterDashboard } from "@/components/SitterDashboard";
import { VetCallRow } from "@/components/sitter/CallRows";

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

function SitterHome() {
  const { token } = Route.useParams();
  const { data: ctx } = useSitterContext(token);
  const { birdId } = useSearch({ from: "/sitter/$token" });
  const { multi, pinnedBirdId } = useSitterShell();
  // Multi-bird sits open on Home until a bird is picked; the Today nav item
  // always carries a birdId, so this only fires on the initial open. One-bird
  // sits go straight to that bird's Today (the one-bird rule, decided once per
  // open) — and stay on the bird they opened on even if a refetch now lists a
  // newer bird first.
  if (multi && !birdId) return <Navigate to="/sitter/$token/home" params={{ token }} replace />;
  if (!multi && !birdId && pinnedBirdId && ctx.activeBirdId !== pinnedBirdId) {
    return <Navigate to="/sitter/$token" params={{ token }} search={{ birdId: pinnedBirdId }} replace />;
  }
  return <SitterToday />;
}

// Literal-key daypart labels (not a dynamic `daypart.${dp}` key) so i18next-parser
// can extract them statically.
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
  const { saved } = useSearch({ from: "/sitter/$token" });
  const { multi } = useSitterShell();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toggle = useServerFn(toggleTaskCompletion);
  // An owner preview ("View as your sitter", "See what [sitter] sees") is
  // read-only: the server refuses task ticks, so the checkboxes are shown
  // disabled with a "Preview only" note instead of failing on tap. Read after
  // mount (it inspects window) so server and client render the same markup.
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => { setReadOnly(isOwnerPreview() || isBirdPreview(ctx)); }, [ctx]);
  const { data: dash } = useSitterDashboard(token);

  const sitId = ctx.sit.id;
  const birdId = ctx.activeBirdId;
  const birds = (ctx.birds ?? []) as any[];
  const birdIndex = Math.max(0, birds.findIndex((b) => b.id === birdId));
  const nextBird = birdIndex < birds.length - 1 ? birds[birdIndex + 1] : null;
  const owner = ownerFirstName(ctx, t);

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
  // Reload timers if the active bird changes; a new bird starts at the top.
  useEffect(() => { setTimers(loadTimers(sitId, birdId)); }, [sitId, birdId]);
  const firstBirdRef = useRef(birdId);
  useEffect(() => {
    if (firstBirdRef.current === birdId) return;
    firstBirdRef.current = birdId;
    window.scrollTo({ top: 0 });
  }, [birdId]);

  // Post-save confirmation. The daily check lands back here with `saved`;
  // hold it in local state for this bird and clear it from the URL so a
  // refresh or back doesn't show it again.
  const [savedFor, setSavedFor] = useState<string | null>(null);
  useEffect(() => {
    if (saved == null) return;
    setSavedFor(birdId);
    qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] });
    navigate({ to: "/sitter/$token", params: { token }, search: { birdId }, replace: true });
  }, [saved, multi, birdId, token, navigate, qc]);

  const m = useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean; title: string }) =>
      toggle({ data: { token, taskId: vars.taskId, completed: vars.completed, today: localDateISO(), preview: isOwnerPreview() } }),
    // OPTIMISTIC: flip the check instantly by patching ctx.completions in the
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
      // Roll the check back and say so — never leave a silent mismatch.
      mctx?.prev?.forEach(([key, data]) => qc.setQueryData(key as any, data));
      toast.error(t("sitter.today.saveFailed", "That didn't save. Please tap it again."));
    },
    onSuccess: (_data, vars) => {
      // Cache is already correct (optimistic patch + confirmed write): no
      // context refetch. Mark the per-bird counts stale so Home and the bird
      // chips catch up (refetches if they're on screen).
      qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] });
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
  // items by their time, untimed items after (by sort order).
  const byDaypart: Record<string, any[]> = {};
  for (const task of ctx.tasks) {
    const dp = taskDaypart(task);
    (byDaypart[dp] ??= []).push(task);
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
  const nowLabel = daypartLabel(nowDp, DAYPART_LABEL[nowDp]);

  const currentList = byDaypart[nowDp] ?? [];
  const currentDone = currentList.filter((task) => completedIds.has(task.id)).length;
  const allCurrentDone = currentList.length > 0 && currentDone === currentList.length;
  const otherSections = DAYPARTS.filter((dp) => dp !== nowDp && (byDaypart[dp]?.length ?? 0) > 0);

  // First feeding item in chronological order carries the new-foods caution.
  let firstFeedingId: string | null = null;
  for (const dp of DAYPARTS) {
    for (const task of byDaypart[dp] ?? []) {
      if (!firstFeedingId && FEEDING_TASK_PATTERN.test(task.title) && !REMOVAL_TASK_PATTERN.test(task.title)) firstFeedingId = task.id;
    }
  }

  // Switcher status per bird. "[n] left" counts routine tasks only, the same
  // tasks Home's "[done] of [total] tasks" counts; the daily check is tracked
  // separately and the chip shows ✓ only when both are done. The active bird
  // counts from this screen's own (optimistic) data; the others from the
  // per-bird summary Home uses.
  const dashById = new Map(((dash?.birds ?? []) as any[]).map((b) => [b.id, b]));
  function leftFor(b: any): { tasksLeft: number; checkDone: boolean } | null {
    if (b.id === birdId) {
      const tasksLeft = (ctx.tasks as any[]).filter((task) => !completedIds.has(task.id)).length;
      return { tasksLeft, checkDone: !!ctx.todayLog };
    }
    const d = dashById.get(b.id);
    if (!d) return null;
    return { tasksLeft: Math.max(0, (d.tasksTotal ?? 0) - (d.tasksDone ?? 0)), checkDone: !!d.scanDone };
  }
  function needsCheck(b: any): boolean {
    if (b.id === birdId) return !ctx.todayLog;
    return !dashById.get(b.id)?.scanDone;
  }

  function goToBird(id: string) {
    navigate({ to: "/sitter/$token", params: { token }, search: { birdId: id } });
  }

  // Swipe left/right on the day to move between birds (multi-bird sits).
  // Ignores swipes that start in a horizontal scroller (the clip strip, the
  // bird chips) and anything mostly vertical.
  const touch = useRef<{ x: number; y: number; skip: boolean } | null>(null);
  function onTouchStart(e: TouchEvent) {
    if (!multi || e.touches.length !== 1) { touch.current = null; return; }
    const target = e.target as HTMLElement;
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, skip: !!target.closest("[data-noswipe]") };
  }
  function onTouchEnd(e: TouchEvent) {
    const start = touch.current;
    touch.current = null;
    if (!start || start.skip) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
    const to = dx < 0 ? birdIndex + 1 : birdIndex - 1;
    if (to >= 0 && to < birds.length) goToBird(birds[to].id);
  }

  function renderTask(task: any, last: boolean) {
    const done = completedIds.has(task.id);
    const open = expandedIds.has(task.id);
    // Localize derived tasks for DISPLAY only. Owner-typed tasks (no descriptor)
    // render verbatim, and all task-matching logic keeps the stored title.
    const disp = task.derived
      ? renderDerivedTask(task.derived as DerivedTask, i18n.getFixedT(i18n.language, "routine"), i18n.language)
      : { title: task.title as string, instructions: task.instructions as string | null };
    const detail = typeof disp.instructions === "string" ? disp.instructions.trim() : "";
    const hasDetail = detail.length > 0;
    const showCaution = task.id === firstFeedingId;
    const time = task.time_of_day && parseTaskMinutes(task.time_of_day) != null ? (task.time_of_day as string) : null;
    return (
      <div key={task.id} style={{ borderBottom: last ? undefined : `1px solid ${K.line}` }}>
        <div className="flex items-start">
          <button
            type="button"
            onClick={() => { if (!readOnly) m.mutate({ taskId: task.id, completed: !done, title: task.title }); }}
            disabled={readOnly}
            aria-pressed={done}
            className="flex min-h-[56px] flex-1 items-start gap-3 py-3 pl-4 text-left disabled:cursor-default"
          >
            <span
              className="mt-px grid size-[26px] shrink-0 place-items-center rounded-full border-2"
              style={{ ...(done ? { background: K.forest, borderColor: K.forest } : { background: "#fff", borderColor: "#b9c6bb" }), ...(readOnly ? { opacity: 0.4 } : {}) }}
              aria-hidden="true"
            >
              {done && <Check className="size-4 text-white" strokeWidth={3} />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-[1.35]" style={done ? { color: K.quiet, textDecoration: "line-through", fontWeight: 500 } : { color: K.forest, fontWeight: 700 }}>
                {disp.title}
                {time && <span className="ml-1.5 text-[12.5px] font-[500]" style={{ color: K.quiet, textDecoration: "none" }}>{time}</span>}
              </span>
              {showCaution && (
                <span className="mt-1 block text-[12.5px] leading-[1.4]" style={{ color: K.amberText }}>
                  {t("sitter.today.noNewFoodsOwner", "Don't introduce new foods while {{owner}} is away.", { owner })}
                </span>
              )}
            </span>
          </button>
          {hasDetail ? (
            <button
              type="button"
              onClick={() => toggleExpanded(task.id)}
              aria-expanded={open}
              aria-label={open ? t("sitter.today.hideDetails", "Hide details") : t("sitter.today.showDetails", "Show details")}
              className="grid size-[52px] shrink-0 place-items-center"
              style={{ color: K.quiet }}
            >
              <ChevronDown className={`size-[18px] transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          ) : <span className="w-4 shrink-0" />}
        </div>
        {hasDetail && open && (
          <p className="m-0 whitespace-pre-line pb-3 pl-[54px] pr-4 text-[13.5px] leading-[1.5]" style={{ color: K.ink }}>{detail}</p>
        )}
      </div>
    );
  }

  const bird = ctx.bird as any;
  const species = (bird.species ?? "").trim() ? speciesLabel(t, (bird.species ?? "").trim()) : t("sitter.today.speciesDefault", "Parrot");
  const showSaved = savedFor === birdId;
  const checkDone = !!ctx.todayLog;
  const nextToCheck = showSaved && multi
    ? [...birds.slice(birdIndex + 1), ...birds.slice(0, birdIndex)].find((b) => needsCheck(b)) ?? null
    : null;

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {multi ? (
        <SitterTabHeader token={token}>
          <BirdSwitcher birds={birds} activeId={birdId} leftFor={leftFor} onPick={goToBird} />
          <div data-coach="welcome-card" className="mt-6">
            <KyaHeading as="h1" size={30} className="text-white">{t("sitter.today.birdsDay", "{{name}}'s day", { name: bird.name })}</KyaHeading>
            <p className="m-0 mt-2 text-[15px] leading-[1.5]" style={{ color: K.paleGreen }}>
              {species} ·{" "}
              <Link to="/sitter/$token/care-sheet" params={{ token }} data-coach="care-plan-link" className="inline-flex min-h-[44px] items-center font-[700] align-middle" style={{ color: K.lime }}>
                {t("sitter.today.carePlanArrow", "Care plan →")}
              </Link>
            </p>
          </div>
        </SitterTabHeader>
      ) : (
        <SitterTabHeader token={token} title={greeting(t, sitterFirstName(ctx))} line={sitLine(ctx, t, i18n.language)}>
          <WalkthroughPill />
        </SitterTabHeader>
      )}

      <KyaBody>
        {!multi && (
          <>
            <KyaHeading size={24} className="px-1">{t("sitter.today.birdsDay", "{{name}}'s day", { name: bird.name })}</KyaHeading>
            <SinglePhotoCard bird={bird} species={species} token={token} />
          </>
        )}

        {showSaved && (
          <KyaCard className="flex flex-col gap-3 p-4" style={{ border: `2px solid ${K.forest}` }}>
            <p className="m-0 flex items-start gap-2 text-[15px] font-[700] leading-[1.4]" role="status">
              <Check className="mt-0.5 size-[18px] shrink-0" style={{ color: K.moss }} strokeWidth={3} aria-hidden="true" />
              {!multi
                ? t("sitter.today.saved", "Saved")
                : nextToCheck
                ? t("sitter.today.savedNext", "Saved. Next: {{name}} still needs a check", { name: nextToCheck.name })
                : t("sitter.today.savedAll", "Saved. Every bird has had a check today")}
            </p>
            {nextToCheck && (
              <Link
                to="/sitter/$token/scan"
                params={{ token }}
                search={{ birdId: nextToCheck.id }}
                className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border-2 bg-white px-5 text-[15px] font-[700] active:scale-[0.99]"
                style={{ borderColor: K.forest, color: K.forest }}
              >
                {t("sitter.today.checkBird", "Check {{name}}", { name: nextToCheck.name })}
              </Link>
            )}
          </KyaCard>
        )}

        <DailyCheckCard bird={bird} todayLog={ctx.todayLog} contacts={(ctx as any).contacts} token={token} />

        {(ctx as any).remindersPaused ? (
          <KyaCard className="p-4">
            <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("sitter.today.remindersPaused", "{{name}}'s reminders are paused.", { name: bird.name })}</p>
          </KyaCard>
        ) : ctx.tasks.length === 0 ? (
          <KyaCard className="p-4">
            <p className="m-0 text-[15px]" style={{ color: K.quiet }}>{t("sitter.today.noTasks", "The owner hasn't added any routine tasks yet.")}</p>
          </KyaCard>
        ) : (
          <>
            {/* The current block — the one heavily bordered card on screen. */}
            <section className="flex flex-col gap-2.5">
              <div className="flex items-baseline justify-between gap-3 px-1">
                <KyaHeading size={21}>{nowLabel}</KyaHeading>
                {currentList.length > 0 && (
                  <span className="shrink-0 text-[13px]" style={{ color: K.quiet }}>
                    {t("sitter.today.dueNowCount", "Due now · {{done}} of {{total}} done", { done: currentDone, total: currentList.length })}
                  </span>
                )}
              </div>
              <div data-coach="daily-checklist" className="overflow-hidden rounded-[20px] bg-white" style={{ border: `2px solid ${K.forest}` }}>
                {readOnly && currentList.length > 0 && <PreviewOnlyNote />}
                {currentList.length === 0 ? (
                  <p className="m-0 p-4 text-[15px]" style={{ color: K.quiet }}>{t("sitter.today.nothingScheduled", "Nothing scheduled for this {{daypart}}.", { daypart: nowLabel.toLowerCase() })}</p>
                ) : (
                  <>
                    {currentList.map((task, i) => renderTask(task, i === currentList.length - 1 && !allCurrentDone))}
                    {allCurrentDone && (
                      <p className="m-0 px-4 py-3 text-[14px] font-[700]" style={{ color: K.moss }}>{t("sitter.today.allDone", "All done for this {{daypart}} — nicely done.", { daypart: nowLabel.toLowerCase() })}</p>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* Other blocks — collapsed rows, expand in place. */}
            {otherSections.map((dp) => {
              const list = byDaypart[dp] ?? [];
              const done = list.filter((task) => completedIds.has(task.id)).length;
              const open = expandedSections.has(dp);
              const titles = list.map((task) => (task.derived ? renderDerivedTask(task.derived as DerivedTask, i18n.getFixedT(i18n.language, "routine"), i18n.language).title : task.title) as string);
              const preview = titles.length <= 3 ? titles.join(", ") : t("sitter.today.nTasks", "{{n}} tasks", { n: titles.length });
              return (
                <KyaCard key={dp}>
                  <button
                    type="button"
                    onClick={() => toggleSection(dp)}
                    aria-expanded={open}
                    className="flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]"
                    style={{ color: K.forest, borderBottom: open ? `1px solid ${K.line}` : undefined }}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-[700]">{daypartLabel(dp, DAYPART_LABEL[dp])}</span>
                      <span className="mt-0.5 block truncate text-[13px]" style={{ color: K.quiet }}>{preview}</span>
                    </span>
                    <span className="shrink-0 text-[13px]" style={{ color: K.quiet }}>{t("sitter.today.doneOfTotal", "{{done}} of {{total}}", { done, total: list.length })}</span>
                    <ChevronDown className={`size-[18px] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: K.quiet }} aria-hidden="true" />
                  </button>
                  {open && readOnly && <PreviewOnlyNote />}
                  {open && list.map((task, i) => renderTask(task, i === list.length - 1))}
                </KyaCard>
              );
            })}
          </>
        )}

        {/* Tips from the owner — owner-recorded clips. */}
        {ctx.watchClips && ctx.watchClips.length > 0 && (
          <section data-coach="owner-tips" className="flex flex-col gap-1">
            <KyaHeading size={21} className="px-1">{t("sitter.today.tipsFrom", "Tips from {{owner}}", { owner })}</KyaHeading>
            <p className="m-0 px-1 text-[14px]" style={{ color: K.quiet }}>{t("sitter.today.tipsLine", "Short clips from {{owner}}, just for you.", { owner })}</p>
            <div data-noswipe className="-mx-4 mt-2 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {ctx.watchClips.map((c: any) => (
                <div key={c.key} className="flex w-60 shrink-0 snap-start flex-col overflow-hidden rounded-[20px] bg-white">
                  <ClipPlayer src={c.url} label={clipSlotLabel(c.key, c.label, t)} className="aspect-video bg-[#12291f]" audience="sitter" ownerName={owner} />
                  <div className="px-3.5 py-3">
                    <p className="m-0 text-[15px] font-[700] leading-[1.3]" style={{ color: K.forest }}>{clipSlotLabel(c.key, c.label, t)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* The bird's care plan + Something's wrong, side by side. */}
        <div className="grid grid-cols-2 gap-2.5">
          <Link
            to="/sitter/$token/care-sheet"
            params={{ token }}
            data-coach={multi ? undefined : "care-plan-link"}
            className="inline-flex min-h-[52px] items-center justify-center rounded-full border-2 bg-white px-3 text-center text-[14.5px] font-[700] leading-[1.2] active:scale-[0.99]"
            style={{ borderColor: K.forest, color: K.forest }}
          >
            {t("sitter.today.birdCarePlan", "{{name}}'s care plan", { name: bird.name })}
          </Link>
          <Link
            to="/sitter/$token/concern"
            params={{ token }}
            className="inline-flex min-h-[52px] items-center justify-center gap-1.5 rounded-full border-2 px-3 text-center text-[14.5px] font-[700] leading-[1.2] active:scale-[0.99]"
            style={{ background: K.amberBg, borderColor: K.amberText, color: K.amberText }}
          >
            {t("sitter.today.somethingsWrong", "Something's wrong")}
          </Link>
        </div>

        {multi && (nextBird ? (
          <button
            type="button"
            onClick={() => goToBird(nextBird.id)}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99]"
            // One sunflower per screen: Start on the check card while the
            // check isn't done, otherwise this button.
            style={{ background: checkDone ? K.sunflower : "#fff", borderColor: K.forest, color: K.forest }}
          >
            {t("sitter.today.nextBird", "Next: {{name}}", { name: nextBird.name })}
            <ArrowRight className="size-[18px]" aria-hidden="true" />
          </button>
        ) : (
          <Link
            to="/sitter/$token/home"
            params={{ token }}
            className="inline-flex min-h-[52px] w-full items-center justify-center rounded-full border-2 px-6 text-[16px] font-[700] active:scale-[0.99]"
            // The last bird's "Next": the main button once its check is done.
            style={{ background: checkDone ? K.sunflower : "#fff", borderColor: K.forest, color: K.forest }}
          >
            {t("sitter.today.backToAllBirds", "Back to all birds")}
          </Link>
        ))}

        {!multi && <AroundHouseCard ctx={ctx} token={token} />}

        <VetNote />
      </KyaBody>
    </div>
  );
}

/** Today's bird switcher (multi-bird sits): 48px pills with a 38px round
 *  photo, the name and "[n] left" (routine tasks; ✓ once tasks and the daily
 *  check are both done, "Check to do" when only the check is left). Selected =
 *  lime with forest text; others darker forest with white text. Scrolls
 *  sideways when there are more birds than fit. */
function BirdSwitcher({ birds, activeId, leftFor, onPick }: {
  birds: any[];
  activeId: string;
  leftFor: (b: any) => { tasksLeft: number; checkDone: boolean } | null;
  onPick: (id: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  // Keep the selected chip in view when the bird changes (swipe, Next).
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>("[aria-pressed='true']");
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);
  return (
    <div
      ref={ref}
      data-coach="bird-switcher"
      data-noswipe
      className="-mx-5 mt-5 flex items-center gap-2 overflow-x-auto px-5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {birds.map((b) => {
        const active = b.id === activeId;
        const left = leftFor(b);
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => onPick(b.id)}
            aria-pressed={active}
            className="flex h-12 shrink-0 items-center gap-2 rounded-full pl-[5px] pr-4 active:scale-95"
            style={active ? { background: K.lime, color: K.forest } : { background: K.forestDeep, color: "#fff" }}
          >
            <BirdAvatar bird={b} size={38} />
            <span className="flex flex-col items-start leading-[1.15]">
              <span className="text-[14.5px] font-[700]">{b.name}</span>
              {left != null && (
                <span className="text-[12px] font-[500]" style={{ color: active ? K.moss : K.teal }}>
                  {left.tasksLeft > 0
                    ? t("sitter.today.nLeft", "{{n}} left", { n: left.tasksLeft })
                    : left.checkDone ? "✓" : t("sitter.today.checkLeft", "Check to do")}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** One-bird sits: the bird's photo, name and species over a dark fade. */
function SinglePhotoCard({ bird, species, token }: { bird: any; species: string; token: string }) {
  const { t } = useTranslation();
  const age = birdAgeLabel(t, bird) ?? "";
  const speciesAge = [species, age].filter(Boolean).join(" · ");
  const initial = (bird.name?.slice(0, 1) ?? "?").toUpperCase();
  return (
    <Link
      to="/sitter/$token/care-sheet"
      params={{ token }}
      data-coach="welcome-card"
      className="relative block h-[210px] overflow-hidden rounded-[20px] active:scale-[0.99]"
      style={{ background: K.forest }}
      aria-label={t("sitter.today.birdCarePlan", "{{name}}'s care plan", { name: bird.name })}
    >
      {bird.photo_url ? (
        <img
          src={bird.photo_url}
          alt=""
          // Not lazy: first thing on the page, and inside the owner's preview
          // frame on iPhone a lazy image may never load.
          loading="eager"
          style={{ objectPosition: bird.photo_position ?? "50% 20%" }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 grid place-items-center text-[56px] font-[700] text-white/85" style={{ fontFamily: SERIF }} aria-hidden="true">{initial}</span>
      )}
      <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-3.5 pt-14">
        <span className="block text-[24px] font-[700] leading-[1.15] text-white" style={{ fontFamily: SERIF }}>{bird.name}</span>
        {speciesAge && <span className="mt-0.5 block text-[14px]" style={{ color: K.lime }}>{speciesAge}</span>}
      </span>
    </Link>
  );
}

function thingsToWatch(log: any): number {
  if (!log) return 0;
  if (Array.isArray(log.triage_reason_codes)) return log.triage_reason_codes.length;
  const r = (log.triage_reasons ?? "").toString().trim();
  return r ? r.split(" | ").filter(Boolean).length : 0;
}

/** Once per task list in an owner preview, where the checkboxes are disabled. */
function PreviewOnlyNote() {
  const { t } = useTranslation();
  return (
    <p className="m-0 px-4 pt-3 text-[13px] font-[700]" style={{ color: K.quiet }}>
      {t("sitter.today.previewOnly", "Preview only")}
    </p>
  );
}

/** The daily health check entry: lime card, status line, Start / See check. */
function DailyCheckCard({ bird, todayLog, contacts, token }: { bird: any; todayLog: any; contacts: any; token: string }) {
  const { t, i18n } = useTranslation();
  const done = !!todayLog;
  const n = thingsToWatch(todayLog);
  const time = done && todayLog.created_at
    ? new Date(todayLog.created_at).toLocaleTimeString(i18n.language === "nl" ? "nl-NL" : "en-US", { hour: "numeric", minute: "2-digit" })
    : "";
  // A red check ("call the vet") replaced the old result screen: make it
  // unmissable here with the vet call row and the way to Emergency.
  const red = done && todayLog.triage_status === "red";
  const line = red ? t("sitter.today.checkDoneCallVet", "Done at {{time}} · call the vet", { time }) : statusLine(t, done, time, n);
  const useAvian = !!contacts?.avian_vet_phone;
  return (
    <section data-coach="scan-card" className="flex flex-col gap-3 rounded-[20px] p-4" style={{ background: K.lime, color: K.forest }}>
      <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <KyaHeading size={19}>{t("sitter.today.birdsCheck", "{{name}}'s daily check", { name: bird.name })}</KyaHeading>
        <p className="m-0 mt-1 text-[14px] leading-[1.4]" style={{ color: red ? K.red : done && n > 0 ? K.amberText : K.forest, fontWeight: red ? 700 : undefined }}>{line}</p>
      </div>
      <Link
        to="/sitter/$token/scan"
        params={{ token }}
        className="inline-flex min-h-[48px] shrink-0 items-center gap-1 rounded-full border-2 px-5 text-[15px] font-[700] active:scale-95"
        style={done ? { background: "#fff", borderColor: K.forest, color: K.forest } : { background: K.sunflower, borderColor: K.forest, color: K.forest }}
      >
        {done ? t("sitter.today.seeCheck", "See check") : t("sitter.today.start", "Start")}
        {done && <ChevronRight className="-mr-1 size-4" aria-hidden="true" />}
      </Link>
      </div>
      {red && (
        <>
          <VetCallRow
            surface="mist"
            label={useAvian ? t("sitter.calls.avianVet", "Avian vet") : t("sitter.calls.emergencyVet", "After-hours emergency vet")}
            name={useAvian ? contacts?.avian_vet_name : contacts?.emergency_vet_name}
            phone={useAvian ? contacts?.avian_vet_phone : contacts?.emergency_vet_phone}
          />
          <Link to="/sitter/$token/emergency" params={{ token }} className="inline-flex min-h-[44px] items-center gap-1 self-start text-[15px] font-[700]" style={{ color: K.moss }}>
            {t("sitter.today.openEmergencyInfo", "Open emergency info")}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  );
}

function statusLine(t: TFunction, done: boolean, time: string, n: number): string {
  if (!done) return t("sitter.today.checkNotDone", "Not done yet today");
  if (n === 0) return t("sitter.today.checkDoneNormal", "Done at {{time}} · all normal", { time });
  if (n === 1) return t("sitter.today.checkDoneWatchOne", "Done at {{time}} · 1 thing to watch", { time });
  return t("sitter.today.checkDoneWatchMany", "Done at {{time}} · {{n}} things to watch", { time, n });
}
