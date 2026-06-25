import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getActiveCaregiverSits, caregiverToggleTaskCompletion, type ActiveCaregiverSit } from "@/lib/caregiver.functions";
import { signBirdPhotos, type SignedPhoto } from "@/lib/birdPhoto";
import { taskDaypart, DAYPARTS, DAYPART_LABEL, isDerivedTask, type Daypart } from "@/lib/routineTasks";
import { InkHero, SectionHead, Card, IconTile, StatusPill } from "@/components/system";
import { Check, CalendarHeart, Sun, ChevronRight, Loader2 } from "lucide-react";
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

function CaregiverSitBlock({ sit }: { sit: ActiveCaregiverSit }) {
  const today = new Date();
  const daysLeft = Math.max(0, Math.round((new Date(sit.endDate + "T23:59:59").getTime() - today.getTime()) / 86_400_000));
  const greeting = (() => { const h = today.getHours(); return h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening"; })();
  const birdNames = sit.birds.map((b) => b.name);
  const eyebrow = birdNames.length > 0 ? `You're caring for ${joinNames(birdNames)}` : "You're covering a sit";
  const body = daysLeft === 0
    ? `${sit.ownerName} is back today. Here's today's check.`
    : daysLeft === 1
      ? `${sit.ownerName} is back tomorrow. Here's today's check.`
      : `${sit.ownerName} is back in ${daysLeft} days. Here's today's check.`;

  // Bird photos.
  const paths = sit.birds.map((b) => b.photo_url).filter(Boolean) as string[];
  const { data: photoMap } = useQuery({
    queryKey: ["caregiver-bird-photos", paths.sort().join(",")],
    enabled: paths.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => Object.fromEntries(await signBirdPhotos(paths, { width: 256 })),
  });
  const photoFor = (b: ActiveCaregiverSit["birds"][number]): SignedPhoto | null => (b.photo_url ? (photoMap as any)?.[b.photo_url] ?? null : null);

  // Group every bird's tasks into one daypart map for the sit. Each row carries
  // its bird so we can show "Willow · Feed: Morning pellets" inline.
  type Row = { taskId: string; title: string; instructions: string | null; birdId: string; birdName: string };
  const grouped = useMemo<Record<Daypart, Row[]>>(() => {
    const out: Record<Daypart, Row[]> = { morning: [], midday: [], evening: [], anytime: [] };
    for (const b of sit.birds) {
      for (const t of b.tasks) {
        const dp = taskDaypart(t);
        out[dp].push({ taskId: t.id, title: t.title, instructions: t.instructions, birdId: b.id, birdName: b.name });
      }
    }
    for (const dp of DAYPARTS) {
      out[dp].sort((a, b) => a.title.localeCompare(b.title));
    }
    return out;
  }, [sit.birds]);

  const doneByTask = useMemo(() => new Set(sit.completionsToday.map((c) => c.taskId)), [sit.completionsToday]);
  const doneAtByTask = useMemo(() => new Map(sit.completionsToday.map((c) => [c.taskId, c.at])), [sit.completionsToday]);

  const totalTasks = Object.values(grouped).reduce((n, l) => n + l.length, 0);
  const doneTotal = sit.completionsToday.filter((c) => grouped.morning.concat(grouped.midday, grouped.evening, grouped.anytime).some((r) => r.taskId === c.taskId)).length;

  const qc = useQueryClient();
  const toggle = useServerFn(caregiverToggleTaskCompletion);
  const m = useMutation({
    mutationFn: (vars: { taskId: string; completed: boolean }) => toggle({ data: { sitId: sit.id, taskId: vars.taskId, completed: vars.completed } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["active-caregiver-sits"] }),
    onError: (e: any) => toast.error(e?.message ?? "Couldn't update."),
  });

  return (
    <>
      <InkHero
        eyebrow={eyebrow}
        headline={`${greeting}.`}
        body={body}
      />
      <div className="px-5 pt-5 space-y-6">
        <section>
          <SectionHead
            title="Today's check"
            trailing={totalTasks > 0 ? <span className="t-meta">{doneTotal}/{totalTasks}</span> : undefined}
          />
          {totalTasks === 0 ? (
            <Card className="p-5 text-center">
              <p className="t-body text-[var(--mute)]">No daily routine items yet. Logs you add still flow into the bird's record.</p>
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
                                {sit.birds.length > 1 && <span className="font-[500] text-[var(--ink2)]">{r.birdName}{r.instructions ? " · " : ""}</span>}
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

        <section>
          <SectionHead title="Birds you're covering" trailing={<StatusPill tone="household">{sit.birds.length} {sit.birds.length === 1 ? "bird" : "birds"}</StatusPill>} />
          <div className="space-y-3">
            {sit.birds.map((b) => (
              <Link
                key={b.id}
                to="/birds/$birdId"
                params={{ birdId: b.id }}
                className="flex items-center gap-3 rounded-[18px] bg-white p-3 ring-1 ring-[var(--line2)] active:scale-[0.995]"
                style={{ boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" }}
              >
                <BirdTile bird={b} photo={photoFor(b)} />
                <div className="min-w-0 flex-1">
                  <p className="t-item truncate text-[17px]">{b.name}</p>
                  <p className="t-meta truncate">{b.species || "Parrot"}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-[var(--mute2)]" />
              </Link>
            ))}
          </div>
        </section>

        {sit.notes && (
          <section>
            <SectionHead title="From the owner" />
            <Card className="p-4">
              <p className="t-body whitespace-pre-line text-[var(--ink2)]">{sit.notes}</p>
            </Card>
          </section>
        )}
      </div>
    </>
  );
}

function BirdTile({ bird, photo }: { bird: ActiveCaregiverSit["birds"][number]; photo: SignedPhoto | null }) {
  const initial = (bird.name?.slice(0, 1) ?? "?").toUpperCase();
  return (
    <div className="h-[80px] w-[72px] shrink-0 overflow-hidden rounded-[14px]" style={{ background: "linear-gradient(135deg,#cdeab0,#a7d68f)" }}>
      {photo ? (
        <img
          src={photo.url}
          alt={bird.name}
          loading="lazy"
          decoding="async"
          onError={(e) => { if (photo.original && e.currentTarget.src !== photo.original) e.currentTarget.src = photo.original; }}
          style={{ objectPosition: bird.photo_position ?? "50% 15%" }}
          className="block size-full object-cover"
        />
      ) : (
        <div className="grid size-full place-items-center"><span className="text-2xl font-[500] text-white/90">{initial}</span></div>
      )}
    </div>
  );
}

// The Today view's "not active" empty state: surfaces an upcoming assignment
// if there is one (the "Today's check starts in N days" case) or routes to
// the normal app otherwise.
export function CaregiverEmpty({ upcoming }: { upcoming: { id: string; title: string | null; startDate: string; endDate: string } | null }) {
  if (upcoming) {
    const d = Math.max(0, Math.round((new Date(upcoming.startDate + "T00:00:00").getTime() - Date.now()) / 86_400_000));
    const when = d === 0 ? "later today" : d === 1 ? "tomorrow" : `in ${d} days`;
    return (
      <Card className="p-6 text-center">
        <div className="flex justify-center"><IconTile size={48} tone="pale" icon={<CalendarHeart className="size-6" />} /></div>
        <h2 className="t-section mt-3">Today's check starts {when}.</h2>
        <p className="t-body mt-1.5 text-[var(--ink2)]">{upcoming.title ? `${upcoming.title} — ` : ""}You'll see the daily list here when it begins.</p>
      </Card>
    );
  }
  return (
    <Card className="p-6 text-center">
      <div className="flex justify-center"><IconTile size={48} tone="pale" icon={<CalendarHeart className="size-6" />} /></div>
      <h2 className="t-section mt-3">No active sit right now.</h2>
      <p className="t-body mt-1.5 text-[var(--ink2)]">When an owner assigns you to cover a sit, the daily checklist shows up here for the dates of that sit.</p>
      <div className="mt-4">
        <Link to="/dashboard" className="inline-flex min-h-[44px] items-center justify-center rounded-[12px] bg-[var(--ink)] px-[18px] py-[11px] text-[15px] font-[500] text-white">Back to home</Link>
      </div>
    </Card>
  );
}

// Spinner state for both the route and the Home embed.
export function CaregiverLoading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-[var(--mute)]"><Loader2 className="size-4 animate-spin" /> Loading…</div>
  );
}

// ---- helpers ----
function joinNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return "your birds";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} & ${n[1]}`;
  return `${n.slice(0, -1).join(", ")} & ${n[n.length - 1]}`;
}
function prettyTitle(t: string): string {
  // The derived-feed titles are like "Feed: Morning pellets" — keep them.
  return isDerivedTask(t) ? t : t;
}
function fmtTime(iso: string): string {
  try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch { return ""; }
}
