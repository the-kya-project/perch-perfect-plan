import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActiveCaregiverSits, caregiverToggleTaskCompletion, type ActiveCaregiverSit } from "@/lib/caregiver.functions";
import { signBirdPhotos } from "@/lib/birdPhoto";
import { taskDaypart, DAYPARTS, DAYPART_LABEL, isDerivedTask, type Daypart } from "@/lib/routineTasks";
import { InkHero, SectionHead, Card, IconTile } from "@/components/system";
import { BirdCareCard } from "@/components/BirdCareCard";
import { Check, CalendarHeart, Sun, Loader2 } from "lucide-react";
import { toast } from "sonner";

// The active-caregiver Home variant. Rendered when the signed-in user is the
// assigned caregiver on at least one sit whose window covers today. Mirrors the
// sitter Today UI (routine_tasks grouped by daypart, task_completions toggled
// today) but auth'd via the user's session, not a token.
//
// Multi-sit support is intentionally lightweight: if the caller is covering
// multiple concurrent sits, each renders as its own block, stacked. The spec
// asks to "handle but not optimize for" multi-concurrent.

export function useActiveCaregiver() {
  const fn = useServerFn(getActiveCaregiverSits);
  return useQuery({
    queryKey: ["active-caregiver-sits"],
    queryFn: () => fn(),
    refetchOnWindowFocus: true,
    // Re-check on a slow cadence so the app reverts at end_date + 1 without a
    // refresh: the server fn filters by today's date.
    staleTime: 5 * 60_000,
  });
}

// Returns the sit id the current user is actively covering for the given bird
// today, or null otherwise. Used by the weight / journal / scan write paths to
// tag rows with sit_id so the sit's activity view can derive its feed from
// attribution (rather than guessing by date overlap, which would over-include
// non-caregiver entries from the same household member during the window).
export function useActiveSitIdForBird(birdId: string | null | undefined): string | null {
  const { data } = useActiveCaregiver();
  if (!birdId || !data?.sits?.length) return null;
  for (const s of data.sits) {
    if (s.birds.some((b) => b.id === birdId)) return s.id;
  }
  return null;
}

export function CaregiverHome({ data }: { data: { sits: ActiveCaregiverSit[]; upcoming: any } }) {
  const sits = data.sits;
  if (sits.length === 0) return null;
  return (
    <div className="space-y-6">
      {sits.map((s) => <CaregiverSitBlock key={s.id} sit={s} />)}
    </div>
  );
}

function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

// The covering member's Home section: the sitter-style "Birds in your care" card
// list (one card per bird with today's task progress), reusing BirdCareCard.
// Tapping a bird navigates to THAT bird's full-screen checklist
// (/covering/$sitId/$birdId → CaregiverTodayChecklist scoped to the bird) — the
// authenticated equivalent of the sitter's per-bird flow, on the same
// task-completion path. Rendered only for the covering lead while the sit is
// active (the caller passes only active sits).
export function CaregiverCoveringSection({ sit, hideHeader }: { sit: ActiveCaregiverSit; hideHeader?: boolean }) {
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

  const where = sit.ownerName ? t("caregiver.ownerBirds", "{{owner}} birds", { owner: possessive(sit.ownerName) }) : t("caregiver.householdBirds", "a household's birds");

  return (
    <section className="space-y-3">
      {!hideHeader && (
        <div className="px-1">
          <h2 className="t-section">{t("caregiver.covering", "Covering {{where}}", { where })}</h2>
          <p className="t-meta text-[var(--teal-on-cream)]">{t("caregiver.sitActive", "Sit active — daily care while {{owner}}'s away", { owner: sit.ownerName || t("caregiver.theOwner", "the owner") })}</p>
        </div>
      )}
      <div className="space-y-3">
        {sit.birds.map((b) => {
          const total = b.tasks.length;
          const done = b.tasks.filter((t) => doneIds.has(t.id)).length;
          return (
            <BirdCareCard
              key={b.id}
              name={b.name}
              species={b.species}
              photoUrl={photoFor(b)}
              photoPosition={b.photo_position}
              tasksDone={done}
              tasksTotal={total}
              scan={{ done: b.scanDone, status: b.scanStatus }}
              onClick={() => navigate({ to: "/covering/$sitId/$birdId", params: { sitId: sit.id, birdId: b.id } })}
            />
          );
        })}
      </div>
    </section>
  );
}

// The sit's daily-care checklist ("Today's check") — routine tasks grouped by
// daypart, toggled via the shared caregiver completion path. Reused by the
// pure-caregiver Home (CaregiverSitBlock / the Today tab) AND, scoped per-bird,
// by the covering member's "Birds in your care" cards above.
export function CaregiverTodayChecklist({ sit, birdId }: { sit: ActiveCaregiverSit; birdId?: string }) {
  const { t } = useTranslation();
  // When birdId is set, scope to that one bird (the per-bird checklist a covering
  // member opens by tapping its card); otherwise show every bird's tasks.
  const scopedBirds = birdId ? sit.birds.filter((b) => b.id === birdId) : sit.birds;
  const multiBird = scopedBirds.length > 1;
  type Row = { taskId: string; title: string; instructions: string | null; birdId: string; birdName: string };
  const grouped = useMemo<Record<Daypart, Row[]>>(() => {
    const out: Record<Daypart, Row[]> = { morning: [], midday: [], evening: [], anytime: [] };
    for (const b of scopedBirds) {
      for (const t of b.tasks) {
        const dp = taskDaypart(t);
        out[dp].push({ taskId: t.id, title: t.title, instructions: t.instructions, birdId: b.id, birdName: b.name });
      }
    }
    for (const dp of DAYPARTS) out[dp].sort((a, b) => a.title.localeCompare(b.title));
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sit.birds, birdId]);

  const doneByTask = useMemo(() => new Set(sit.completionsToday.map((c) => c.taskId)), [sit.completionsToday]);
  const doneAtByTask = useMemo(() => new Map(sit.completionsToday.map((c) => [c.taskId, c.at])), [sit.completionsToday]);
  const totalTasks = Object.values(grouped).reduce((n, l) => n + l.length, 0);
  const doneTotal = sit.completionsToday.filter((c) => grouped.morning.concat(grouped.midday, grouped.evening, grouped.anytime).some((r) => r.taskId === c.taskId)).length;

  const qc = useQueryClient();
  const toggle = useServerFn(caregiverToggleTaskCompletion);
  const m = useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean }) => toggle({ data: { sitId: sit.id, taskId: vars.taskId, completed: vars.completed } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-caregiver-sits"] }),
    onError: (e: any) => toast.error(e?.message ?? t("caregiver.updateFailed", "Couldn't update.")),
  });

  return (
    <section>
      <SectionHead
        title={t("caregiver.todaysCheck", "Today's check")}
        trailing={totalTasks > 0 ? <span className="t-meta">{doneTotal}/{totalTasks}</span> : undefined}
      />
      {totalTasks === 0 ? (
        <Card className="p-5 text-center">
          <p className="t-body text-[var(--mute)]">{t("caregiver.noRoutineItems", "No daily routine items yet. Logs you add still flow into the bird's record.")}</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {DAYPARTS.map((dp) => {
            const rows = grouped[dp];
            if (!rows.length) return null;
            return (
              <div key={dp} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <Sun className="size-4 text-[var(--mute)]" />
                  <p className="t-eyebrow text-[var(--mute2)]">{DAYPART_LABEL[dp]}</p>
                </div>
                <Card>
                  {rows.map((r, i) => {
                    const done = doneByTask.has(r.taskId);
                    const at = doneAtByTask.get(r.taskId);
                    return (
                      <button
                        key={r.taskId}
                        type="button"
                        disabled={m.isPending}
                        onClick={() => m.mutate({ taskId: r.taskId, completed: !done })}
                        className={`flex min-h-[48px] w-full items-center gap-3 px-4 py-2.5 text-left disabled:opacity-60 ${i === rows.length - 1 ? "" : "border-b border-[var(--line2)]"}`}
                      >
                        <span
                          className={`grid size-6 shrink-0 place-items-center rounded-full ${done ? "bg-[var(--moss)] text-white" : "ring-1 ring-[var(--line)] bg-white"}`}
                          aria-hidden="true"
                        >
                          {done && <Check className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`t-item block ${done ? "line-through text-[var(--mute2)]" : ""}`}>{prettyTitle(r.title)}</span>
                          <span className="t-meta block">
                            {multiBird && <span className="font-[500] text-[var(--ink2)]">{r.birdName}{r.instructions ? " · " : ""}</span>}
                            {r.instructions && <span>{r.instructions}</span>}
                            {done && at && <span className="ml-1">· done {fmtTime(at)}</span>}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function CaregiverSitBlock({ sit }: { sit: ActiveCaregiverSit }) {
  const { t } = useTranslation();
  const today = new Date();
  const daysLeft = Math.max(0, Math.round((new Date(sit.endDate + "T23:59:59").getTime() - today.getTime()) / 86_400_000));
  const greeting = (() => { const h = today.getHours(); return h < 12 ? t("caregiver.morning", "Morning") : h < 18 ? t("caregiver.afternoon", "Afternoon") : t("caregiver.evening", "Evening"); })();
  const birdNames = sit.birds.map((b) => b.name);
  const eyebrow = birdNames.length > 0 ? t("caregiver.caringFor", "You're caring for {{names}}", { names: joinNames(birdNames, t) }) : t("caregiver.coveringSit", "You're covering a sit");
  const body = daysLeft === 0
    ? t("caregiver.backToday", "{{owner}} is back today. Here's today's check.", { owner: sit.ownerName })
    : daysLeft === 1
      ? t("caregiver.backTomorrow", "{{owner}} is back tomorrow. Here's today's check.", { owner: sit.ownerName })
      : t("caregiver.backInDays", "{{owner}} is back in {{days}} days. Here's today's check.", { owner: sit.ownerName, days: daysLeft });

  return (
    <>
      <InkHero
        showBrand
        eyebrow={eyebrow}
        headline={t("caregiver.greetingDot", "{{greeting}}.", { greeting })}
        body={body}
      />
      <div className="px-5 pt-5 space-y-6">
        {/* Per-bird "Birds in your care" cards → tap opens that bird's checklist +
            health scan. Same view every covering member gets (any preset), so a
            pure caregiver / care manager and a covering owner see one thing. */}
        <CaregiverCoveringSection sit={sit} hideHeader />

        {sit.notes && (
          <section>
            <SectionHead title={t("caregiver.fromOwner", "From the owner")} />
            <Card className="p-4">
              <p className="t-body whitespace-pre-line text-[var(--ink2)]">{sit.notes}</p>
            </Card>
          </section>
        )}
      </div>
    </>
  );
}

// The Today view's "not active" empty state: surfaces an upcoming assignment
// if there is one (the "Today's check starts in N days" case) or routes to
// the normal app otherwise.
export function CaregiverEmpty({ upcoming }: { upcoming: { id: string; title: string | null; startDate: string; endDate: string } | null }) {
  const { t } = useTranslation();
  if (upcoming) {
    const d = Math.max(0, Math.round((new Date(upcoming.startDate + "T00:00:00").getTime() - Date.now()) / 86_400_000));
    const when = d === 0 ? t("caregiver.laterToday", "later today") : d === 1 ? t("caregiver.tomorrow", "tomorrow") : t("caregiver.inDays", "in {{days}} days", { days: d });
    return (
      <Card className="p-6 text-center">
        <div className="flex justify-center"><IconTile size={48} tone="pale" icon={<CalendarHeart className="size-6" />} /></div>
        <h2 className="t-section mt-3">{t("caregiver.checkStarts", "Today's check starts {{when}}.", { when })}</h2>
        <p className="t-body mt-1.5 text-[var(--ink2)]">{upcoming.title ? t("caregiver.titlePrefix", "{{title}} — ", { title: upcoming.title }) : ""}{t("caregiver.willSeeList", "You'll see the daily list here when it begins.")}</p>
      </Card>
    );
  }
  return (
    <Card className="p-6 text-center">
      <div className="flex justify-center"><IconTile size={48} tone="pale" icon={<CalendarHeart className="size-6" />} /></div>
      <h2 className="t-section mt-3">{t("caregiver.noActiveSit", "No active sit right now.")}</h2>
      <p className="t-body mt-1.5 text-[var(--ink2)]">{t("caregiver.noActiveSitBody", "When an owner assigns you to cover a sit, the daily checklist shows up here for the dates of that sit.")}</p>
      <div className="mt-4">
        <Link to="/dashboard" className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--ink)] px-[18px] py-[11px] text-[15px] font-[500] text-white">{t("caregiver.backToHome", "Back to home")}</Link>
      </div>
    </Card>
  );
}

// Spinner state for both the route and the Home embed.
export function CaregiverLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[var(--mute)]"><Loader2 className="size-4 animate-spin" /> {t("caregiver.loading", "Loading…")}</div>
  );
}

// ---- helpers ----
function joinNames(names: string[], t: TFunction): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return t("caregiver.yourBirds", "your birds");
  if (n.length === 1) return n[0];
  if (n.length === 2) return t("caregiver.joinTwo", "{{a}} & {{b}}", { a: n[0], b: n[1] });
  return t("caregiver.joinMany", "{{list}} & {{last}}", { list: n.slice(0, -1).join(", "), last: n[n.length - 1] });
}
function prettyTitle(t: string): string {
  // The derived-feed titles are like "Feed: Morning pellets" — keep them.
  return isDerivedTask(t) ? t : t;
}
function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}
