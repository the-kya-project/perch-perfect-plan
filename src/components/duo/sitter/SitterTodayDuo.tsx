// The sitter's day on the iPhone Duo (two panes, lib/duo.ts). Today and Home
// both show it. Left, on dark forest: "Today with [birds]", day X of Y, a
// progress bar and "N of M done", then the whole sit's checklist as big rows
// (each bird's daily check first, then the routine by part of the day): box,
// time, task, which birds. Right: the picked row. For a task, "How [owner]
// does it" (the task's own instructions, a matching clip the owner recorded,
// a tip from the care plan in amber) and one gold "Mark done"; for a daily
// check, its status and one gold "Start [bird]'s check".
//
// One gold button per screen: the check rows' Start pills are outline (on
// the dark pane they can't be confused with the main button); the gold one is
// always the right half's main button.
//
// Same data and the same writes as the phone's Today: every bird's sitter
// context (the same query and cache keys, so the phone's optimistic tick
// patches all of them), and toggleTaskCompletion for ticks.
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { toast } from "sonner";
import { Check, ChevronRight } from "lucide-react";
import { getSitterContext, toggleTaskCompletion } from "@/lib/sitter.functions";
import { isOwnerPreview } from "@/lib/sitterPreviewMode";
import { localDateISO } from "@/lib/localDay";
import { taskDaypart, hourToDaypart, parseTaskMinutes, DAYPARTS, DAYPART_LABEL, type Daypart } from "@/lib/routineTasks";
import { renderDerivedTask } from "@/lib/routineTaskRender";
import type { DerivedTask } from "@/lib/derivedTasks";
import { clipSlotLabel } from "@/lib/clipSlotLabels";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";
import { ClipPlayer } from "@/components/ClipPlayer";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { K, SERIF } from "@/components/kya";
import { VetCallRow } from "@/components/sitter/CallRows";
import {
  BirdAvatar, aroundHouseItems, caringForNames, isBirdPreview, ownerFirstName, sitLine,
} from "@/components/sitter/sitterShared";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard } from "@/components/duo/DuoBlocks";
import { SitterDuoTopBar } from "@/components/duo/sitter/SitterDuoRail";
import { sitterContextQuery, useSitterContext } from "@/routes/sitter/$token/route";

// The same patterns the phone's Today uses (routes/sitter/$token/index.tsx).
const REMOVAL_TASK_PATTERN = /^remove fresh food/i;
const FEEDING_TASK_PATTERN = /\b(feed|food|pellet|seed|chop|veg|veggies|salad|sprout|fruit|breakfast|dinner|harrison)\b/i;
const WATER_TASK_PATTERN = /\bwater\b/i;

type TaskRef = { task: any; birdId: string };
type Row =
  | { kind: "check"; key: string; bird: any; ctx: any; done: boolean }
  | {
      kind: "task"; key: string; daypart: Daypart; time: string | null; title: string; instructions: string;
      refs: TaskRef[]; birds: any[]; done: boolean;
    }
  | { kind: "tips"; key: string; clips: { clip: any; ctx: any }[] };

function thingsToWatch(log: any): number {
  if (!log) return 0;
  if (Array.isArray(log.triage_reason_codes)) return log.triage_reason_codes.length;
  const r = (log.triage_reasons ?? "").toString().trim();
  return r ? r.split(" | ").filter(Boolean).length : 0;
}

function checkStatus(t: TFunction, log: any, lang: string): { line: string; red: boolean; watch: number } {
  if (!log) return { line: t("sitter.today.checkNotDone", "Not done yet today"), red: false, watch: 0 };
  const time = log.created_at ? new Date(log.created_at).toLocaleTimeString(lang === "nl" ? "nl-NL" : "en-US", { hour: "numeric", minute: "2-digit" }) : "";
  const n = thingsToWatch(log);
  if (log.triage_status === "red") return { line: t("sitter.today.checkDoneCallVet", "Done at {{time}} · call the vet", { time }), red: true, watch: n };
  if (n === 0) return { line: t("sitter.today.checkDoneNormal", "Done at {{time}} · all normal", { time }), red: false, watch: 0 };
  if (n === 1) return { line: t("sitter.today.checkDoneWatchOne", "Done at {{time}} · 1 thing to watch", { time }), red: false, watch: 1 };
  return { line: t("sitter.today.checkDoneWatchMany", "Done at {{time}} · {{n}} things to watch", { time, n }), red: false, watch: n };
}

/** A clip the owner recorded that shows this kind of task, if there is one. */
function clipForTask(title: string, clips: any[]): any | null {
  const by = (key: string) => clips.find((c) => c.key === key) ?? null;
  const s = title.toLowerCase();
  if (WATER_TASK_PATTERN.test(s)) return by("food_water");
  if (FEEDING_TASK_PATTERN.test(s) && !REMOVAL_TASK_PATTERN.test(s)) return by("food_prep") ?? by("food_water");
  if (/\b(bed|bedtime|night|cover|sleep)\b/.test(s)) return by("bedtime");
  if (/\b(toy|toys|forag\w*)\b/.test(s)) return by("toys_foraging");
  if (/\b(step.?up|handl\w*|out of (the )?cage)\b/.test(s)) return by("step_up");
  return null;
}

/** Care-plan tips for a task, from each of its birds' plans (no repeats). */
function tipsForTask(t: TFunction, title: string, ctxs: any[], owner: string): string[] {
  const out = new Set<string>();
  const s = title.toLowerCase();
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (FEEDING_TASK_PATTERN.test(s) && !REMOVAL_TASK_PATTERN.test(s)) {
    out.add(t("sitter.today.noNewFoodsOwner", "Don't introduce new foods while {{owner}} is away.", { owner }));
    for (const c of ctxs) {
      const never = text(c?.plan?.foods_never_allowed);
      if (never) out.add(t("sitter.duo.today.neverFeed", "Never feed: {{list}}", { list: never }));
    }
  }
  if (REMOVAL_TASK_PATTERN.test(s)) for (const c of ctxs) { const v = text(c?.plan?.fresh_food_removal); if (v) out.add(v); }
  else if (WATER_TASK_PATTERN.test(s)) for (const c of ctxs) { const v = text(c?.plan?.water_notes); if (v) out.add(v); }
  return [...out];
}

export function SitterTodayDuo({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const ctxQ = useSitterContext(token);
  const ctx = ctxQ.data as any;
  const { saved } = useSearch({ from: "/sitter/$token" });
  const fn = useServerFn(getSitterContext);
  const toggle = useServerFn(toggleTaskCompletion);
  const owner = ownerFirstName(ctx, t);
  const routineT = i18n.getFixedT(i18n.language, "routine");

  const birds = (ctx.birds ?? []) as any[];
  // Every other bird's context, under the same keys the phone's Today uses.
  const otherBirds = birds.filter((b) => b.id !== ctx.activeBirdId);
  const otherQs = useQueries({ queries: otherBirds.map((b) => sitterContextQuery(fn, token, b.id)) });
  const ctxByBird = new Map<string, any>([[ctx.activeBirdId, ctx]]);
  otherBirds.forEach((b, i) => { if (otherQs[i]?.data) ctxByBird.set(b.id, otherQs[i].data); });
  const loadingBirds = otherBirds.filter((_, i) => otherQs[i]?.isPending);
  const failedBirds = otherBirds.map((b, i) => ({ b, q: otherQs[i] })).filter((x) => x.q?.isError);

  // Owner previews are read-only (the server refuses ticks). Read after mount.
  const [readOnly, setReadOnly] = useState(false);
  useEffect(() => { setReadOnly(isOwnerPreview() || isBirdPreview(ctx)); }, [ctx]);

  // Re-render every minute so "now" stays right.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [selected, setSelected] = useState<string | null>(null);
  // Back from a saved check: say so once, clear it from the URL, and let the
  // selection move on to whatever is next.
  const [savedNote, setSavedNote] = useState(false);
  useEffect(() => {
    if (saved == null) return;
    setSavedNote(true);
    setSelected(null);
    qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] });
    navigate({ to: "/sitter/$token", params: { token }, search: { birdId: ctx.activeBirdId }, replace: true });
  }, [saved, ctx.activeBirdId, token, navigate, qc]);

  const m = useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean }) =>
      toggle({ data: { token, taskId: vars.taskId, completed: vars.completed, today: localDateISO(), preview: isOwnerPreview() } }),
    // Optimistic, exactly as the phone's Today: patch completions in every
    // cached sitter context, roll back and say so on failure.
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
      mctx?.prev?.forEach(([key, data]) => qc.setQueryData(key as any, data));
      toast.error(t("sitter.today.saveFailed", "That didn't save. Please tap it again."));
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sitter-dashboard", token] }); },
  });

  // Completions are per sit (every bird's), and every cached context is
  // patched together, so the active one is the truth.
  const completedIds = new Set(((ctx.completions ?? []) as any[]).map((c) => c.routine_task_id));
  function setDone(row: Extract<Row, { kind: "task" }>, completed: boolean) {
    if (readOnly) return;
    for (const r of row.refs) if (completedIds.has(r.task.id) !== completed) m.mutate({ taskId: r.task.id, completed });
  }

  // ---- The rows ------------------------------------------------------------
  const loadedBirds = birds.filter((b) => ctxByBird.has(b.id));
  const checkRows: Row[] = loadedBirds.map((b) => {
    const c = ctxByBird.get(b.id);
    return { kind: "check", key: `check:${b.id}`, bird: c.bird ?? b, ctx: c, done: !!c.todayLog };
  });
  // Same task for several birds (same text, same time) is one row.
  const groups = new Map<string, Extract<Row, { kind: "task" }>>();
  for (const b of loadedBirds) {
    const c = ctxByBird.get(b.id);
    for (const task of (c.tasks ?? []) as any[]) {
      const disp = task.derived
        ? renderDerivedTask(task.derived as DerivedTask, routineT, i18n.language)
        : { title: task.title as string, instructions: task.instructions as string | null };
      const daypart = taskDaypart(task);
      const time = task.time_of_day && parseTaskMinutes(task.time_of_day) != null ? (task.time_of_day as string) : null;
      const instructions = typeof disp.instructions === "string" ? disp.instructions.trim() : "";
      const gk = `${daypart}|${time ?? ""}|${disp.title}|${instructions}`;
      const g = groups.get(gk);
      if (g) { g.refs.push({ task, birdId: b.id }); if (!g.birds.some((x) => x.id === b.id)) g.birds.push(c.bird ?? b); }
      else groups.set(gk, { kind: "task", key: `task:${task.id}`, daypart, time, title: disp.title, instructions, refs: [{ task, birdId: b.id }], birds: [c.bird ?? b], done: false });
    }
  }
  const taskRows = [...groups.values()].map((g) => ({ ...g, done: g.refs.every((r) => completedIds.has(r.task.id)) }));
  taskRows.sort((a, b) => {
    const da = DAYPARTS.indexOf(a.daypart), db = DAYPARTS.indexOf(b.daypart);
    if (da !== db) return da - db;
    const va = parseTaskMinutes(a.time) ?? 1e9, vb = parseTaskMinutes(b.time) ?? 1e9;
    return va !== vb ? va - vb : (a.refs[0].task.sort_order ?? 0) - (b.refs[0].task.sort_order ?? 0);
  });
  const clips = loadedBirds.flatMap((b) => ((ctxByBird.get(b.id).watchClips ?? []) as any[]).map((clip) => ({ clip, ctx: ctxByBird.get(b.id) })));
  const tipsRow: Row | null = clips.length > 0 ? { kind: "tips", key: "tips", clips } : null;
  const rows: Row[] = [...checkRows, ...taskRows, ...(tipsRow ? [tipsRow] : [])];

  const countable = rows.filter((r) => r.kind !== "tips") as Exclude<Row, { kind: "tips" }>[];
  const doneCount = countable.filter((r) => r.done).length;
  const open = rows.find((r) => r.key === selected)
    ?? countable.find((r) => !r.done)
    ?? rows[0];
  const pausedBirds = loadedBirds.filter((b) => ctxByBird.get(b.id)?.remindersPaused);
  const nowDp = hourToDaypart(new Date().getHours());

  const daypartLabel = (dp: Daypart) => {
    switch (dp) {
      case "morning": return t("sitter.today.daypart.morning", "Morning");
      case "midday": return t("sitter.today.daypart.midday", "Midday");
      case "evening": return t("sitter.today.daypart.evening", "Evening");
      case "anytime": return t("sitter.today.daypart.anytime", "Anytime");
      default: return DAYPART_LABEL[dp as Daypart];
    }
  };

  // The bird "Something's wrong" is about: the open row's bird when it has
  // exactly one, else the bird Today is on.
  const openBirds = open?.kind === "check" ? [open.bird] : open?.kind === "task" ? open.birds : [];
  const concernBirdId = openBirds.length === 1 ? openBirds[0].id : ctx.activeBirdId;
  const hasAround = aroundHouseItems(ctx, t).length > 0;

  // ---- Left -----------------------------------------------------------------
  let lastDp: Daypart | null = null;
  const left = (
    <>
      <SitterDuoTopBar token={token} />
      <div data-coach="welcome-card" className="mt-7">
        <h1 className="m-0 text-[30px] font-[600] leading-tight [text-wrap:balance]" style={{ fontFamily: SERIF }}>
          {t("sitter.duo.today.title", "Today with {{names}}", { names: caringForNames(t, birds.map((b) => b.name)) })}
        </h1>
        <p className="m-0 mt-1.5 text-[15px] leading-[1.45]" style={{ color: K.paleGreen }}>{sitLine(ctx, t, i18n.language)}</p>
        {countable.length > 0 && (
          <div className="mt-4">
            <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.16)" }} aria-hidden="true">
              <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.round((doneCount / countable.length) * 100)}%`, background: K.lime }} />
            </div>
            <p className="m-0 mt-2 text-[15px] font-[700]" style={{ color: K.lime }}>
              {t("sitter.duo.today.progress", "{{done}} of {{total}} done", { done: doneCount, total: countable.length })}
            </p>
          </div>
        )}
        {savedNote && (
          <p role="status" className="m-0 mt-3 inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[14px] font-[700]" style={{ background: K.lime, color: K.forest }}>
            <Check className="size-4" strokeWidth={3} aria-hidden="true" /> {t("sitter.today.saved", "Saved")}
          </p>
        )}
      </div>

      <ol data-coach="daily-checklist" aria-label={t("sitter.duo.today.listAria", "Today's checklist")} className="m-0 mt-6 flex list-none flex-col gap-1.5 p-0">
        {rows.map((row, i) => {
          const on = row.key === open?.key;
          let heading: ReactNode = null;
          if (row.kind === "task" && row.daypart !== lastDp) {
            lastDp = row.daypart;
            heading = (
              <p className="m-0 mt-4 px-4 pb-1 text-[13px] font-[700] uppercase tracking-[0.08em]" style={{ color: "rgba(255,255,255,0.7)" }}>
                {daypartLabel(row.daypart)}
                {row.daypart === nowDp && <span className="ml-2 normal-case tracking-normal" style={{ color: K.lime }}>{t("sitter.duo.today.now", "Now")}</span>}
              </p>
            );
          }
          if (row.kind === "tips" && i > 0) heading = <div className="mt-4" />;
          return (
            <li key={row.key} className={on ? "duo-step-current" : undefined}>
              {heading}
              <ChecklistRow
                row={row}
                on={on}
                token={token}
                owner={owner}
                readOnly={readOnly}
                coach={row.kind === "check" && i === 0 ? "scan-card" : row.kind === "tips" ? "owner-tips" : undefined}
                onSelect={() => setSelected(row.key)}
                onToggle={row.kind === "task" ? () => setDone(row, !row.done) : undefined}
              />
            </li>
          );
        })}
        {loadingBirds.map((b) => (
          <li key={`loading:${b.id}`} aria-busy="true" className="flex min-h-[64px] items-center gap-3.5 rounded-[20px] px-4 py-3">
            <span className="size-8 shrink-0 animate-pulse rounded-full bg-white/15" />
            <span className="h-4 w-2/3 animate-pulse rounded-md bg-white/15" />
          </li>
        ))}
      </ol>

      {failedBirds.map(({ b, q }) => (
        <button key={`failed:${b.id}`} type="button" onClick={() => q.refetch()} className="mt-2 min-h-[48px] rounded-[16px] px-4 text-left text-[15px] font-[700]" style={{ background: "rgba(255,255,255,0.1)", color: "#fff" }}>
          {t("sitter.duo.today.loadFailed", "{{name}}'s tasks didn't load. Tap to try again.", { name: b.name })}
        </button>
      ))}
      {pausedBirds.map((b) => (
        <p key={`paused:${b.id}`} className="m-0 mt-3 px-4 text-[15px]" style={{ color: "rgba(255,255,255,0.75)" }}>
          {t("sitter.today.remindersPaused", "{{name}}'s reminders are paused.", { name: b.name })}
        </p>
      ))}
      {taskRows.length === 0 && pausedBirds.length === 0 && loadingBirds.length === 0 && (
        <p className="m-0 mt-3 px-4 text-[15px]" style={{ color: "rgba(255,255,255,0.75)" }}>{t("sitter.today.noTasks", "The owner hasn't added any routine tasks yet.")}</p>
      )}

      <div className="mt-8 flex flex-col gap-2.5">
        {birds.map((b, i) => (
          <Link
            key={b.id}
            to="/sitter/$token/care-sheet"
            params={{ token }}
            search={{ birdId: b.id }}
            data-coach={i === 0 ? "care-plan-link" : undefined}
            className="inline-flex min-h-[56px] items-center justify-between gap-3 rounded-full border-2 px-5 text-[16px] font-[700] active:scale-[0.99]"
            style={{ borderColor: "rgba(255,255,255,0.55)", color: "#fff" }}
          >
            <span className="flex min-w-0 items-center gap-3">
              <BirdAvatar bird={b} size={32} />
              <span className="truncate">{t("sitter.today.birdCarePlan", "{{name}}'s care plan", { name: b.name })}</span>
            </span>
            <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
          </Link>
        ))}
        <Link
          to="/sitter/$token/concern"
          params={{ token }}
          search={{ birdId: concernBirdId }}
          className="inline-flex min-h-[56px] items-center justify-center rounded-full border-2 px-5 text-[16px] font-[700] active:scale-[0.99]"
          style={{ background: K.amberBg, borderColor: K.amberText, color: K.amberText }}
        >
          {t("sitter.today.somethingsWrong", "Something's wrong")}
        </Link>
        {hasAround && (
          <Link
            to="/sitter/$token/around"
            params={{ token }}
            className="inline-flex min-h-[56px] items-center justify-between gap-3 rounded-full border-2 px-5 text-[16px] font-[700] active:scale-[0.99]"
            style={{ borderColor: "rgba(255,255,255,0.55)", color: "#fff" }}
          >
            {t("sitter.around.title", "Around the house")}
            <ChevronRight className="size-5 shrink-0" aria-hidden="true" />
          </Link>
        )}
      </div>
      <p className="m-0 mt-6 text-[13px] leading-[1.5]" style={{ color: "rgba(255,255,255,0.6)" }}>
        {t("disclaimer.compactBody", "Not a substitute for veterinary care. Call a vet for any medical concern.")}
      </p>
    </>
  );

  // ---- Right ----------------------------------------------------------------
  const nextUndone = (after: Row) => {
    const i = rows.findIndex((r) => r.key === after.key);
    return [...rows.slice(i + 1), ...rows.slice(0, i)].find((r) => r.kind !== "tips" && !r.done) as Exclude<Row, { kind: "tips" }> | undefined;
  };
  const rowTitle = (r: Exclude<Row, { kind: "tips" }>) => r.kind === "check" ? t("sitter.today.birdsCheck", "{{name}}'s daily check", { name: r.bird.name }) : r.title;

  let right: ReactNode = null;
  if (open?.kind === "task") {
    const ctxs = open.birds.map((b) => ctxByBird.get(b.id)).filter(Boolean);
    const clip = clipForTask(open.refs[0].task.title ?? "", (ctxs[0]?.watchClips ?? []) as any[]);
    const tips = tipsForTask(t, open.refs[0].task.title ?? "", ctxs, owner);
    const next = open.done ? nextUndone(open) : undefined;
    right = (
      <PopOutCard
        eyebrow={t("sitter.duo.today.howOwnerDoesIt", "How {{owner}} does it", { owner })}
        title={open.title}
        action={readOnly
          ? undefined
          : !open.done
            ? <DuoMainButton onClick={() => setDone(open, true)}><Check className="size-5" strokeWidth={3} aria-hidden="true" />{t("sitter.duo.today.markDone", "Mark done")}</DuoMainButton>
            : next
              ? <DuoMainButton onClick={() => setSelected(next.key)}>{t("sitter.duo.today.nextTask", "Next: {{title}}", { title: rowTitle(next) })}</DuoMainButton>
              : undefined}
        footer={readOnly
          ? <span className="text-[14px] font-[700]" style={{ color: DUO.quiet }}>{t("sitter.today.previewOnly", "Preview only")}</span>
          : open.done && (
            <button type="button" onClick={() => setDone(open, false)} className="min-h-[48px] px-3 text-[15px] font-[700] underline underline-offset-4" style={{ color: K.moss }}>
              {t("sitter.duo.today.markNotDone", "Mark as not done")}
            </button>
          )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1 text-[14px] font-[700]" style={{ background: DUO.bg, color: DUO.forest }}>
            {open.time ?? daypartLabel(open.daypart)}
          </span>
          {open.birds.map((b) => (
            <span key={b.id} className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-3 text-[14px] font-[700]" style={{ background: DUO.bg, color: DUO.forest }}>
              <BirdAvatar bird={b} size={26} /> {b.name}
            </span>
          ))}
          {open.done && <span className="rounded-full px-3 py-1 text-[14px] font-[700]" style={{ background: DUO.fineBg, color: DUO.forest }}>{t("sitter.duo.today.doneTag", "Done")}</span>}
        </div>
        {open.instructions ? (
          <p className="m-0 mt-5 whitespace-pre-line text-[17px] leading-[1.55]" style={{ color: K.ink }}>{open.instructions}</p>
        ) : (
          <p className="m-0 mt-5 text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>{t("sitter.duo.today.noSteps", "{{owner}} didn't add any steps for this one.", { owner })}</p>
        )}
        {clip && (
          <div className="mt-5 overflow-hidden rounded-[20px]" style={{ background: "#12291f" }}>
            <ClipPlayer
              src={clip.url}
              label={clipSlotLabel(clip.key, clip.label, t)}
              className="aspect-video bg-[#12291f]"
              audience="sitter"
              ownerName={owner}
              refreshSrc={async () => {
                const r = await qc.fetchQuery({ ...sitterContextQuery(fn, token, open.birds[0].id), staleTime: 0 });
                return ((r?.watchClips ?? []) as { key: string; url: string }[]).find((x) => x.key === clip.key)?.url ?? null;
              }}
            />
            <p className="m-0 px-4 py-3 text-[15px] font-[700] text-white">{clipSlotLabel(clip.key, clip.label, t)}</p>
          </div>
        )}
        {tips.length > 0 && (
          <div className="mt-5 flex flex-col gap-1.5 rounded-[18px] p-4" style={{ background: K.amberBg, color: K.amberText }}>
            <p className="m-0 text-[13px] font-[700] uppercase tracking-[0.08em]">{t("sitter.duo.today.tip", "Tip from the care plan")}</p>
            {tips.map((tip) => <p key={tip} className="m-0 whitespace-pre-line text-[16px] leading-[1.45]">{tip}</p>)}
          </div>
        )}
      </PopOutCard>
    );
  } else if (open?.kind === "check") {
    const b = open.bird;
    const st = checkStatus(t, open.ctx.todayLog, i18n.language);
    const contacts = open.ctx.contacts ?? {};
    const useAvian = !!contacts.avian_vet_phone;
    const go = () => navigate({ to: "/sitter/$token/scan", params: { token }, search: { birdId: b.id } });
    right = (
      <PopOutCard
        eyebrow={t("sitter.duo.today.dailyCheck", "Daily health check")}
        title={t("sitter.today.birdsCheck", "{{name}}'s daily check", { name: b.name })}
        action={<DuoMainButton onClick={go}>{open.done ? t("sitter.duo.today.seeCheck", "See {{name}}'s check", { name: b.name }) : t("sitter.duo.today.startCheck", "Start {{name}}'s check", { name: b.name })}</DuoMainButton>}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[22px]" style={{ background: K.forest }}>
          {b.photo_url ? (
            <BirdPhotoCrop url={b.photo_url} original={b.photo_url} position={b.photo_position || BIRD_PHOTO_FOCUS} alt="" eager />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-[64px] font-[700] text-white/85" style={{ fontFamily: SERIF }} aria-hidden="true">{(b.name?.slice(0, 1) ?? "?").toUpperCase()}</span>
          )}
        </div>
        <p className="m-0 mt-5 text-[18px] font-[700] leading-[1.4]" style={{ color: st.red ? K.red : st.watch > 0 ? K.amberText : DUO.forest }}>{st.line}</p>
        {!open.done && (
          <p className="m-0 mt-2 text-[16px] leading-[1.5]" style={{ color: K.ink }}>
            {t("sitter.duo.today.checkLine", "A few minutes: look at {{name}} and answer a short list of questions. {{owner}} sees it right away.", { name: b.name, owner })}
          </p>
        )}
        {st.red && (
          <div className="mt-4 flex flex-col gap-3">
            <VetCallRow
              surface="mist"
              label={useAvian ? t("sitter.calls.avianVet", "Avian vet") : t("sitter.calls.emergencyVet", "After-hours emergency vet")}
              name={useAvian ? contacts.avian_vet_name : contacts.emergency_vet_name}
              phone={useAvian ? contacts.avian_vet_phone : contacts.emergency_vet_phone}
            />
            <Link to="/sitter/$token/emergency" params={{ token }} search={{ birdId: b.id }} className="inline-flex min-h-[48px] items-center gap-1 self-start text-[16px] font-[700]" style={{ color: K.moss }}>
              {t("sitter.today.openEmergencyInfo", "Open emergency info")}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        )}
      </PopOutCard>
    );
  } else if (open?.kind === "tips") {
    right = (
      <PopOutCard
        eyebrow={t("sitter.today.tipsLine", "Short clips from {{owner}}, just for you.", { owner })}
        title={t("sitter.today.tipsFrom", "Tips from {{owner}}", { owner })}
      >
        <div className="flex flex-col gap-4">
          {open.clips.map(({ clip, ctx: c }) => (
            <div key={`${c.activeBirdId}:${clip.key}`} className="overflow-hidden rounded-[20px]" style={{ background: "#12291f" }}>
              <ClipPlayer
                src={clip.url}
                label={clipSlotLabel(clip.key, clip.label, t)}
                className="aspect-video bg-[#12291f]"
                audience="sitter"
                ownerName={owner}
                refreshSrc={async () => {
                  const r = await qc.fetchQuery({ ...sitterContextQuery(fn, token, c.activeBirdId), staleTime: 0 });
                  return ((r?.watchClips ?? []) as { key: string; url: string }[]).find((x) => x.key === clip.key)?.url ?? null;
                }}
              />
              <p className="m-0 px-4 py-3 text-[15px] font-[700] text-white">
                {clipSlotLabel(clip.key, clip.label, t)}
                {birds.length > 1 && <span className="font-[500]" style={{ color: K.paleGreen }}> · {c.bird?.name}</span>}
              </p>
            </div>
          ))}
        </div>
      </PopOutCard>
    );
  }

  return (
    <DuoTwoPane
      dark
      left={left}
      right={right}
      leftLabel={t("sitter.duo.today.listAria", "Today's checklist")}
      rightLabel={t("sitter.duo.today.detailAria", "What to do")}
    />
  );
}

/** One big checklist row on the dark pane. The picked one is light and runs
 *  to the fold. The round box ticks a task (a daily check is ticked by doing
 *  it); the rest of the row picks it. */
function ChecklistRow({ row, on, token, owner, readOnly, coach, onSelect, onToggle }: {
  row: Row;
  on: boolean;
  token: string;
  owner: string;
  readOnly: boolean;
  coach?: string;
  onSelect: () => void;
  onToggle?: () => void;
}) {
  const { t } = useTranslation();
  const done = row.kind !== "tips" && row.done;
  const rowStyle = on ? { background: DUO.bg, color: DUO.forest } : { color: "#fff" };
  const quiet = on ? DUO.quiet : "rgba(255,255,255,0.72)";
  const box = (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full border-2"
      style={done
        ? { background: DUO.fineBg, borderColor: DUO.fineBg, color: DUO.forest }
        : { borderColor: on ? "#9fb3a5" : "rgba(255,255,255,0.5)", background: on ? "#fff" : "transparent" }}
    >
      {done && <Check className="size-[18px]" strokeWidth={3} />}
    </span>
  );

  let time: ReactNode = null;
  let title: ReactNode;
  let who: ReactNode = null;
  if (row.kind === "check") {
    title = t("sitter.today.birdsCheck", "{{name}}'s daily check", { name: row.bird.name });
    who = done ? t("sitter.duo.today.checkDoneShort", "Done") : t("sitter.today.checkNotDone", "Not done yet today");
  } else if (row.kind === "task") {
    time = row.time;
    title = row.title;
    who = row.birds.map((b) => b.name).join(", ");
  } else {
    title = t("sitter.today.tipsFrom", "Tips from {{owner}}", { owner });
    who = t("sitter.duo.today.clipCount", "{{n}} clips", { n: row.clips.length });
  }

  return (
    <div data-coach={coach} className={`flex min-h-[68px] items-center gap-1 rounded-[20px] ${on ? "rounded-r-none" : ""}`} style={rowStyle}>
      {row.kind === "task" ? (
        <button
          type="button"
          onClick={onToggle}
          disabled={readOnly}
          aria-pressed={done}
          aria-label={done ? t("sitter.duo.today.untick", "Mark {{title}} as not done", { title: row.title }) : t("sitter.duo.today.tick", "Mark {{title}} done", { title: row.title })}
          className="grid size-14 shrink-0 place-items-center rounded-full disabled:opacity-40"
        >
          {box}
        </button>
      ) : (
        <span className="grid size-14 shrink-0 place-items-center">{row.kind === "tips" ? <span className="size-8" /> : box}</span>
      )}
      <button type="button" onClick={onSelect} aria-current={on ? "step" : undefined} className="flex min-h-[68px] min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 text-left">
        {row.kind === "task" && (
          <span className="w-[52px] shrink-0 text-[14px] font-[700] tabular-nums" style={{ color: quiet }}>{time ?? ""}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] leading-tight" style={done ? { textDecoration: "line-through", fontWeight: 500, opacity: 0.75 } : { fontWeight: 700 }}>{title}</span>
          {who && <span className="mt-0.5 block truncate text-[14px] leading-snug" style={{ color: quiet }}>{who}</span>}
        </span>
      </button>
      {row.kind === "check" && (
        <Link
          to="/sitter/$token/scan"
          params={{ token }}
          search={{ birdId: row.bird.id }}
          className="mr-3 inline-flex min-h-[48px] shrink-0 items-center rounded-full border-2 px-5 text-[15px] font-[700] active:scale-95"
          style={on ? { borderColor: DUO.forest, color: DUO.forest, background: "#fff" } : { borderColor: "rgba(255,255,255,0.7)", color: "#fff" }}
        >
          {done ? t("sitter.today.seeCheck", "See check") : t("sitter.today.start", "Start")}
        </Link>
      )}
    </div>
  );
}
