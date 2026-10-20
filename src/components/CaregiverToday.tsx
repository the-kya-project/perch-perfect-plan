import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { caregiverToggleTaskCompletion, type ActiveCaregiverSit } from "@/lib/caregiver.functions";
import { signBirdPhotos } from "@/lib/birdPhoto";
import { taskDaypart, DAYPARTS, DAYPART_LABEL, type Daypart } from "@/lib/routineTasks";
import { renderDerivedTask } from "@/lib/routineTaskRender";
import type { DerivedTask } from "@/lib/derivedTasks";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { speciesLabel } from "@/lib/speciesLabel";
import { K, KyaCard, KyaHeading, KyaIconTile, KyaGroupLabel, KyaSecondaryButton } from "@/components/kya";
import { Check, CalendarHeart, Loader2, Stethoscope, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errorMessage";
import { formatLocalTime } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import { useTranslation } from "react-i18next";
import i18next, { type TFunction } from "i18next";

// Kya-styled versions of the active-caregiver views used by the /today and
// /covering/$sitId/$birdId pages. Same data and the same task-completion path
// as components/CaregiverHome.tsx (which still serves the dashboard's
// "Covering …" section); only the presentation differs.

/** One stacked block per active sit: who you're caring for, the bird cards,
 *  and the owner's notes. The page header carries the greeting. */
export function KyaCaregiverToday({ sits }: { sits: ActiveCaregiverSit[] }) {
  if (sits.length === 0) return null;
  return (
    <>
      {sits.map((s) => <KyaCaregiverSitBlock key={s.id} sit={s} showBody={sits.length > 1} />)}
    </>
  );
}

/** "Morning" / "Afternoon" / "Evening" for the Today page title. */
export function caregiverGreeting(t: TFunction): string {
  const h = new Date().getHours();
  return h < 12 ? t("caregiverHome.morning", "Morning") : h < 18 ? t("caregiverHome.afternoon", "Afternoon") : t("caregiverHome.evening", "Evening");
}

/** "{{owner}} is back in N days. Here's today's check." */
export function caregiverBackLine(t: TFunction, sit: ActiveCaregiverSit): string {
  const daysLeft = Math.max(0, Math.round((new Date(sit.endDate + "T23:59:59").getTime() - Date.now()) / 86_400_000));
  const owner = sit.ownerName || t("caregiverHome.theOwner", "the owner");
  return daysLeft === 0
    ? t("caregiverHome.backToday", "{{owner}} is back today. Here's today's check.", { owner })
    : daysLeft === 1
      ? t("caregiverHome.backTomorrow", "{{owner}} is back tomorrow. Here's today's check.", { owner })
      : t("caregiverHome.backInDays", "{{owner}} is back in {{n}} days. Here's today's check.", { owner, n: daysLeft });
}

function KyaCaregiverSitBlock({ sit, showBody }: { sit: ActiveCaregiverSit; showBody: boolean }) {
  const { t } = useTranslation();
  const birdNames = sit.birds.map((b) => b.name);
  const heading = birdNames.length > 0
    ? t("caregiverHome.youreCaringFor", "You're caring for {{names}}", { names: joinNames(birdNames) })
    : t("caregiverHome.youreCoveringASit", "You're covering a sit");

  return (
    <section className="flex flex-col gap-3">
      <div className="px-1">
        <KyaHeading>{heading}</KyaHeading>
        {showBody && <p className="m-0 mt-1 text-[14px] leading-[1.5]" style={{ color: K.quiet }}>{caregiverBackLine(t, sit)}</p>}
      </div>
      {/* Per-bird cards → tap opens that bird's checklist + health scan. */}
      <KyaCoveringBirds sit={sit} />

      {sit.notes && (
        <KyaCard className="p-4">
          <KyaHeading>{t("caregiverHome.fromTheOwner", "From the owner")}</KyaHeading>
          <p className="m-0 mt-2 whitespace-pre-line text-[15px] leading-[1.5]" style={{ color: K.ink }}>{sit.notes}</p>
        </KyaCard>
      )}
    </section>
  );
}

/** The "birds in your care" list: photo, name, today's progress, scan status. */
function KyaCoveringBirds({ sit }: { sit: ActiveCaregiverSit }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const doneIds = useMemo(() => new Set(sit.completionsToday.map((c) => c.taskId)), [sit.completionsToday]);

  const paths = sit.birds.map((b) => b.photo_url).filter(Boolean) as string[];
  const { data: photoMap } = useQuery({
    queryKey: ["covering-bird-photos", paths.slice().sort().join(",")],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => Object.fromEntries(await signBirdPhotos(paths, { width: 800 })),
  });
  const photoFor = (b: ActiveCaregiverSit["birds"][number]): string | null =>
    b.photo_url ? ((photoMap as any)?.[b.photo_url]?.url ?? null) : null;

  return (
    <KyaCard>
      {sit.birds.map((b, i) => {
        const total = b.tasks.length;
        const done = b.tasks.filter((task) => doneIds.has(task.id)).length;
        const allDone = total > 0 && done === total;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const photo = photoFor(b);
        const scan = !b.scanDone
          ? { color: K.amberText, label: t("birdCareCard.healthCheckNotDone", "Health check not done yet") }
          : b.scanStatus === "red"
            ? { color: K.red, label: t("birdCareCard.healthCheckFlagged", "Health check flagged") }
            : b.scanStatus === "yellow"
              ? { color: K.amberText, label: t("birdCareCard.healthCheckFlagged", "Health check flagged") }
              : { color: K.moss, label: t("birdCareCard.healthCheckDoneToday", "Health check done today") };
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => navigate({ to: "/covering/$sitId/$birdId", params: { sitId: sit.id, birdId: b.id } })}
            className="flex min-h-[76px] w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]"
            style={{ borderBottom: i === sit.birds.length - 1 ? undefined : `1px solid ${K.line}`, color: K.forest }}
          >
            {photo ? (
              <div className="relative size-14 shrink-0 overflow-hidden rounded-[14px]">
                <BirdPhotoCrop url={photo} original={photo} position={b.photo_position ?? "50% 20%"} alt={b.name} />
              </div>
            ) : (
              <span className="grid size-14 shrink-0 place-items-center rounded-[14px] text-[22px] font-[700] text-white" style={{ background: K.forest }}>
                {(b.name?.slice(0, 1) ?? "?").toUpperCase()}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="truncate text-[15px] font-[700]">{b.name}</span>
                {b.species && <span className="truncate text-[13px]" style={{ color: K.quiet }}>{speciesLabel(t, b.species)}</span>}
              </span>
              <span className="mt-1 block text-[13px]" style={{ color: K.quiet }}>
                {total === 0
                  ? t("birdCareCard.noRoutineTasks", "No routine tasks")
                  : allDone
                    ? t("birdCareCard.allDone", "All {{total}} done", { total })
                    : t("birdCareCard.doneOf", "{{done}} of {{total}} done", { done, total })}
              </span>
              {total > 0 && (
                <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full" style={{ background: K.mist }}>
                  <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: K.moss }} />
                </span>
              )}
              <span className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-[700]" style={{ color: scan.color }}>
                <Stethoscope className="size-3.5" aria-hidden="true" />
                {scan.label}
              </span>
            </span>
            <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
          </button>
        );
      })}
    </KyaCard>
  );
}

/** Today's check: routine tasks grouped by daypart, toggled through the shared
 *  caregiver completion path. Scoped to one bird when `birdId` is set. */
export function KyaCaregiverChecklist({ sit, birdId }: { sit: ActiveCaregiverSit; birdId?: string }) {
  const { t, i18n } = useTranslation();
  const scopedBirds = birdId ? sit.birds.filter((b) => b.id === birdId) : sit.birds;
  const multiBird = scopedBirds.length > 1;
  type Row = { taskId: string; title: string; instructions: string | null; birdId: string; birdName: string };
  const grouped = useMemo<Record<Daypart, Row[]>>(() => {
    const out: Record<Daypart, Row[]> = { morning: [], midday: [], evening: [], anytime: [] };
    for (const b of scopedBirds) {
      for (const task of b.tasks) {
        const dp = taskDaypart(task);
        // Derived tasks are localized for display only; owner-typed tasks render verbatim.
        const disp = task.derived
          ? renderDerivedTask(task.derived as DerivedTask, i18n.getFixedT(i18n.language, "routine"), i18n.language)
          : { title: task.title, instructions: task.instructions };
        out[dp].push({ taskId: task.id, title: disp.title, instructions: disp.instructions, birdId: b.id, birdName: b.name });
      }
    }
    for (const dp of DAYPARTS) out[dp].sort((a, b) => a.title.localeCompare(b.title));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sit.birds, birdId, i18n.language]);

  const doneByTask = useMemo(() => new Set(sit.completionsToday.map((c) => c.taskId)), [sit.completionsToday]);
  const doneAtByTask = useMemo(() => new Map(sit.completionsToday.map((c) => [c.taskId, c.at])), [sit.completionsToday]);
  const totalTasks = Object.values(grouped).reduce((n, l) => n + l.length, 0);
  const doneTotal = sit.completionsToday.filter((c) => grouped.morning.concat(grouped.midday, grouped.evening, grouped.anytime).some((r) => r.taskId === c.taskId)).length;

  const qc = useQueryClient();
  const toggle = useServerFn(caregiverToggleTaskCompletion);
  const m = useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean }) => toggle({ data: { sitId: sit.id, taskId: vars.taskId, completed: vars.completed, today: localDateISO() } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-caregiver-sits"] }),
    onError: (e: any) => toast.error(friendlyError(e, t("caregiverHome.couldntUpdate", "Couldn't update."))),
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <KyaHeading>{t("caregiverHome.todaysCheck", "Today's check")}</KyaHeading>
        {totalTasks > 0 && <span className="text-[14px] font-[700]" style={{ color: K.quiet }}>{doneTotal}/{totalTasks}</span>}
      </div>
      {totalTasks === 0 ? (
        <KyaCard className="p-5 text-center">
          <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.quiet }}>{t("caregiverHome.noRoutineItems", "No daily routine items yet. Logs you add still flow into the bird's record.")}</p>
        </KyaCard>
      ) : (
        DAYPARTS.map((dp) => {
          const rows = grouped[dp];
          if (!rows.length) return null;
          return (
            <div key={dp} className="flex flex-col gap-2">
              <KyaGroupLabel>{daypartLabel(t, dp)}</KyaGroupLabel>
              <KyaCard>
                {rows.map((r, i) => {
                  const done = doneByTask.has(r.taskId);
                  const at = doneAtByTask.get(r.taskId);
                  return (
                    <button
                      key={r.taskId}
                      type="button"
                      disabled={m.isPending}
                      onClick={() => m.mutate({ taskId: r.taskId, completed: !done })}
                      className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left disabled:opacity-60 active:bg-black/[0.03]"
                      style={{ borderBottom: i === rows.length - 1 ? undefined : `1px solid ${K.line}`, color: K.forest }}
                    >
                      <span
                        className="grid size-7 shrink-0 place-items-center rounded-full"
                        style={done ? { background: K.forest, color: K.lime } : { background: "#fff", boxShadow: "inset 0 0 0 2px #cfd8cf" }}
                        aria-hidden="true"
                      >
                        {done && <Check className="size-4" strokeWidth={2.8} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-[15px] font-[700] ${done ? "line-through" : ""}`} style={done ? { color: K.quiet } : undefined}>{r.title}</span>
                        {(multiBird || r.instructions || (done && at)) && (
                          <span className="mt-0.5 block text-[13px]" style={{ color: K.quiet }}>
                            {multiBird && <span className="font-[700]" style={{ color: K.ink }}>{r.birdName}{r.instructions ? " · " : ""}</span>}
                            {r.instructions && <span>{r.instructions}</span>}
                            {done && at && <span className="ml-1">{t("caregiverHome.doneAt", "· done {{time}}", { time: fmtTime(at) })}</span>}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </KyaCard>
            </div>
          );
        })
      )}
    </section>
  );
}

/** Not covering anything today: the upcoming assignment if there is one,
 *  otherwise a way back home. */
export function KyaCaregiverEmpty({ upcoming }: { upcoming: { id: string; title: string | null; startDate: string; endDate: string } | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (upcoming) {
    const d = Math.max(0, Math.round((new Date(upcoming.startDate + "T00:00:00").getTime() - Date.now()) / 86_400_000));
    const when = d === 0
      ? t("caregiverHome.laterToday", "later today")
      : d === 1 ? t("caregiverHome.tomorrow", "tomorrow") : t("caregiverHome.inDays", "in {{n}} days", { n: d });
    return (
      <KyaCard className="flex flex-col items-center p-6 text-center">
        <KyaIconTile size={48} tone="mist"><CalendarHeart className="size-6" /></KyaIconTile>
        <KyaHeading className="mt-3">{t("caregiverHome.checkStartsTitle", "Today's check starts {{when}}", { when })}</KyaHeading>
        <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{upcoming.title ? `${upcoming.title} — ` : ""}{t("caregiverHome.dailyListWhenBegins", "You'll see the daily list here when it begins.")}</p>
      </KyaCard>
    );
  }
  return (
    <KyaCard className="flex flex-col items-center p-6 text-center">
      <KyaIconTile size={48} tone="mist"><CalendarHeart className="size-6" /></KyaIconTile>
      <KyaHeading className="mt-3">{t("caregiverHome.noActiveSitTitle", "No active sit right now")}</KyaHeading>
      <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("caregiverHome.noActiveSitBody", "When an owner assigns you to cover a sit, the daily checklist shows up here for the dates of that sit.")}</p>
      <div className="mt-4">
        <KyaSecondaryButton onClick={() => navigate({ to: "/dashboard" })}>{t("caregiverHome.backToHome", "Back to home")}</KyaSecondaryButton>
      </div>
    </KyaCard>
  );
}

export function KyaCaregiverLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[14px]" style={{ color: K.quiet }}>
      <Loader2 className="size-4 animate-spin" /> {t("caregiverHome.loading", "Loading…")}
    </div>
  );
}

// ---- helpers (same keys as CaregiverHome.tsx) ----
function joinNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return i18next.t("caregiverHome.yourBirds", "your birds");
  if (n.length === 1) return n[0];
  if (n.length === 2) return i18next.t("caregiverHome.joinTwo", "{{a}} & {{b}}", { a: n[0], b: n[1] });
  return i18next.t("caregiverHome.joinMany", "{{list}} & {{last}}", { list: n.slice(0, -1).join(", "), last: n[n.length - 1] });
}
function daypartLabel(t: TFunction, dp: Daypart): string {
  switch (dp) {
    case "morning": return t("caregiverHome.daypart.morning", "Morning");
    case "midday": return t("caregiverHome.daypart.midday", "Midday");
    case "evening": return t("caregiverHome.daypart.evening", "Evening");
    case "anytime": return t("caregiverHome.daypart.anytime", "Anytime");
    default: return DAYPART_LABEL[dp];
  }
}
function fmtTime(iso: string): string {
  try { return formatLocalTime(new Date(iso), { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}
