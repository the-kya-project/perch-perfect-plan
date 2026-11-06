// The Sits tab on the iPhone Duo (two panes, lib/duo.ts): every sit as a big
// card on the left (Now, Coming up, Past) with "Set up a sit" as the screen's
// one main button, and the picked sit in a pop-out card on the right. Shared
// by /sits and /sits/$sitId; picking a card replaces the URL with that sit's,
// so a reload keeps it and Back still leaves the tab. Every other screen size
// keeps the phone pages exactly as they were.
import type { ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { Activity, Check, Eye, Link2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { K, KyaLink, SERIF } from "@/components/kya";
import { LoadError } from "@/components/LoadError";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { CaregiverAvatar, type ListSit, type SitBird } from "@/components/SitListCards";
import { SitChecklist } from "@/components/SitChecklist";
import { DUO, DuoMainButton, DuoTwoPane, PopOutCard, StatusPill, type TileTone } from "@/components/duo/DuoBlocks";
import { fetchSitDetail, fetchSitsFull, useSitDelete } from "@/components/duo/sits/sitsData";
import { ActivityRow, DeleteSitControl, fmtWhen } from "@/components/duo/sits/SitActivity";
import { SitterPreviewCard } from "@/components/duo/sits/SitterPreviewCard";
import { fetchBirdList } from "@/lib/birdListSelect";
import { useLoadState } from "@/lib/useTooLong";
import { resolveHouseholdNames } from "@/lib/home.functions";
import { memberDisplayName } from "@/lib/memberDisplay";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { daysUntil, durationDays } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import { rangeTo, sitTitle } from "@/lib/sitText";
import { copySitterLink } from "@/lib/sitLink";
import { renderDerivedTask } from "@/lib/routineTaskRender";
import type { DerivedTask } from "@/lib/derivedTasks";
import { resolveScanPhotoUrls } from "@/lib/scanPhoto";
import { BIRD_PHOTO_FOCUS } from "@/lib/birdPhotoFocus";

type Phase = "now" | "upcoming" | "past";
type Sit = ListSit & { sit_birds?: { bird_id: string }[]; sitter_email?: string | null };

const OUTLINE = "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 bg-white px-5 text-[16px] font-[700] active:scale-[0.99]";

function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function SitsDuo({ selectedId }: { selectedId?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Same queries (and cache keys / shapes) as the phone Sits page.
  const birdsQ = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return data ?? [];
    },
  });
  const sitsQ = useQuery({ queryKey: ["sits-full"], queryFn: fetchSitsFull });
  const load = useLoadState([birdsQ, sitsQ]);
  const { data: myId } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await getLocalUser()).data.user?.id ?? null,
  });
  const birds = (birdsQ.data ?? []) as any[];
  const allSits = (sitsQ.data ?? []) as Sit[];
  const ownedBirds = birds.filter((b) => b.owner_id === myId);
  const canManageSits = !!myId && ownedBirds.length > 0;

  const personIds = [...new Set(allSits.map((s) => s.caregiver_user_id).filter(Boolean) as string[])];
  const resolveNames = useServerFn(resolveHouseholdNames);
  const { data: nameMap = {} } = useQuery({
    queryKey: ["sit-person-names", personIds.slice().sort().join(",")],
    enabled: personIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => resolveNames({ data: { userIds: personIds } }),
  });
  const caregiverName = (s: Sit): string =>
    s.caregiver_user_id ? memberDisplayName((nameMap as Record<string, any>)[s.caregiver_user_id]) : (s.sitter_name?.trim() || t("sits.yourSitter", "Your sitter"));
  const iAmLead = (s: Sit) => !!myId && s.caregiver_user_id === myId;

  const birdLookup = Object.fromEntries(birds.map((b) => [b.id, b]));
  const resolvePhoto = useBirdPhotos(birds.map((b) => b.photo_url), 800);
  const birdsFor = (s: Sit): SitBird[] =>
    (s.sit_birds ?? [])
      .map((sb) => birdLookup[sb.bird_id])
      .filter(Boolean)
      .map((b: any) => {
        const sp = resolvePhoto(b.photo_url);
        return { id: b.id, name: b.name, photo_url: sp?.url ?? null, photo_original: sp?.original ?? null, photo_position: b.photo_position };
      });

  const today = localDateISO();
  const actives = allSits.filter((s) => s.start_date <= today && s.end_date >= today).sort((a, b) => b.start_date.localeCompare(a.start_date));
  const upcoming = allSits.filter((s) => s.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = allSits.filter((s) => s.end_date < today).sort((a, b) => b.end_date.localeCompare(a.end_date));
  const ordered: { sit: Sit; phase: Phase }[] = [
    ...actives.map((sit) => ({ sit, phase: "now" as const })),
    ...upcoming.map((sit) => ({ sit, phase: "upcoming" as const })),
    ...past.map((sit) => ({ sit, phase: "past" as const })),
  ];
  const current = ordered.find((o) => o.sit.id === selectedId) ?? ordered[0] ?? null;

  const pick = (id: string) => {
    if (id !== current?.sit.id) void navigate({ to: "/sits/$sitId", params: { sitId: id }, replace: true });
  };
  const setUp = () => navigate({ to: "/sits/new" });

  const titleFor = (s: Sit) => {
    const youCover = !!s.caregiver_user_id && iAmLead(s);
    return youCover ? s.title?.trim() || t("sitCards.youreCovering", "You're covering this sit") : sitTitle(t, s, caregiverName(s));
  };

  // ---- Left pane ------------------------------------------------------------
  const ready = !load.loading && !load.failed;
  const noSits = ready && allSits.length === 0;
  const memberNoSits = noSits && birds.length > 0 && !canManageSits;

  let left: ReactNode;
  if (load.failed) {
    left = <LoadError onRetry={load.retry} />;
  } else if (!ready) {
    left = (
      <>
        <PaneTitle>{t("sitsDuo.title", "Sits")}</PaneTitle>
        <div className="mt-6 flex flex-col gap-3" aria-hidden="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-[104px] animate-pulse rounded-[24px] bg-white" />)}
        </div>
      </>
    );
  } else if (birds.length === 0) {
    left = (
      <>
        <PaneTitle>{t("sits.addBirdFirst", "Add a bird first")}</PaneTitle>
        <p className="m-0 mt-2 text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>
          {t("sits.addBirdFirstBody", "A sit shares one or more birds' care plans with a sitter. Add a bird to create your first sit.")}
        </p>
        <div className="mt-auto pt-6"><DuoMainButton onClick={() => navigate({ to: "/birds/new" })}>{t("sits.addBird", "Add bird")}</DuoMainButton></div>
      </>
    );
  } else if (noSits) {
    left = (
      <>
        <PaneTitle>{memberNoSits ? t("sits.memberNoSitsTitle", "No sits right now") : t("sits.heroGoingAway", "Going away?")}</PaneTitle>
        <p className="m-0 mt-2 text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>
          {memberNoSits
            ? t("sits.memberNoSitsLineNoName", "When a sit is set up for you, it'll show here.")
            : t("sits.heroGoingAwayBody", "For when you can't be there — set up a sit and share what they need to know.")}
        </p>
        {!memberNoSits && (
          <p className="m-0 mt-3 text-[16px] leading-[1.5]">
            {t("sits.noSitsBody", "A sit shares today's routine, a daily health check, and one-tap emergency contacts with whoever's covering.")}
          </p>
        )}
        {canManageSits && <div className="mt-auto pt-6"><DuoMainButton onClick={setUp}>{t("sits.setUpSit", "Set up a sit")}</DuoMainButton></div>}
      </>
    );
  } else {
    left = (
      <>
        <PaneTitle>{t("sitsDuo.title", "Sits")}</PaneTitle>
        <ul className="m-0 mt-5 flex list-none flex-col gap-3 p-0" aria-label={t("sitsDuo.title", "Sits")}>
          {ordered.map(({ sit, phase }) => (
            <li key={sit.id}>
              <SitCardButton
                sit={sit}
                phase={phase}
                title={titleFor(sit)}
                who={iAmLead(sit) ? t("sitCards.you", "You") : caregiverName(sit)}
                selected={current?.sit.id === sit.id}
                onSelect={() => pick(sit.id)}
              />
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-6">
          {canManageSits ? (
            <DuoMainButton onClick={setUp}>{t("sits.setUpSit", "Set up a sit")}</DuoMainButton>
          ) : (
            <p className="m-0 text-center text-[14px]" style={{ color: DUO.quiet }}>{t("sits.onlyOwner", "Only a bird's owner can set up a sit.")}</p>
          )}
        </div>
      </>
    );
  }

  // ---- Right pane -----------------------------------------------------------
  let right: ReactNode;
  if (!ready) {
    right = <div className="min-h-full animate-pulse rounded-[28px] bg-white" aria-hidden="true" />;
  } else if (current) {
    right = (
      <SitCard
        key={current.sit.id}
        sit={current.sit}
        phase={current.phase}
        title={titleFor(current.sit)}
        caregiver={caregiverName(current.sit)}
        birds={birdsFor(current.sit)}
        iOwnSit={current.sit.owner_id === myId}
      />
    );
  } else if (ownedBirds[0]) {
    right = <SitterPreviewCard bird={ownedBirds[0]} />;
  } else {
    right = (
      <PopOutCard eyebrow={t("sitsDuo.sitterGets", "What a sitter gets")} title={t("sits.noSitsTitle", "No sits scheduled")}>
        <p className="m-0 text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>
          {t("sits.noSitsBody", "A sit shares today's routine, a daily health check, and one-tap emergency contacts with whoever's covering.")}
        </p>
      </PopOutCard>
    );
  }

  return <DuoTwoPane left={left} right={right} leftLabel={t("sitsDuo.title", "Sits")} rightLabel={current ? titleFor(current.sit) : undefined} />;
}

function PaneTitle({ children }: { children: ReactNode }) {
  return <h1 className="m-0 text-[30px] font-[600] leading-tight" style={{ fontFamily: SERIF, color: DUO.forest }}>{children}</h1>;
}

function phasePill(t: (k: string, d: string) => string, phase: Phase): { text: string; tone: TileTone } {
  return phase === "now"
    ? { text: t("sitsDuo.now", "Now"), tone: "fine" }
    : phase === "upcoming"
      ? { text: t("sits.comingUp", "Coming up"), tone: "attention" }
      : { text: t("sitsDuo.past", "Past"), tone: "neutral" };
}

/** One sit on the left: initial, name, who and when, status pill; the sit
 *  happening now also shows how far along it is. Selected = forest. */
function SitCardButton({ sit, phase, title, who, selected, onSelect }: {
  sit: Sit;
  phase: Phase;
  title: string;
  who: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const pill = phasePill(t, phase);
  const total = durationDays(sit.start_date, sit.end_date);
  const dayOf = Math.min(total, Math.max(1, -daysUntil(sit.start_date) + 1));
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="flex w-full flex-col gap-3 rounded-[24px] border p-4 text-left active:scale-[0.99]"
      style={selected
        ? { background: DUO.forest, borderColor: DUO.forest, color: "#fff", boxShadow: "0 10px 24px rgba(26,61,46,0.22)" }
        : { background: "#fff", borderColor: DUO.line, color: DUO.forest }}
    >
      <span className="flex w-full items-center gap-3.5">
        <CaregiverAvatar name={who} household={!!sit.caregiver_user_id} size={48} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] font-[700] leading-tight">{title}</span>
          <span className="mt-1 block truncate text-[14px]" style={{ color: selected ? "rgba(255,255,255,0.78)" : DUO.quiet }}>
            {who} · {rangeTo(t, sit.start_date, sit.end_date)}
          </span>
        </span>
        <span className="shrink-0"><StatusPill tone={pill.tone} inverted={selected}>{pill.text}</StatusPill></span>
      </span>
      {phase === "now" && total > 0 && (
        <span className="block w-full">
          <span className="block h-1.5 w-full overflow-hidden rounded-full" style={{ background: selected ? "rgba(255,255,255,0.18)" : "#e3ebe2" }} aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${Math.round((dayOf / total) * 100)}%`, background: selected ? DUO.fineBg : DUO.forest }} />
          </span>
          <span className="mt-1.5 block text-[13px] font-[700]" style={{ color: selected ? "rgba(255,255,255,0.78)" : DUO.quiet }}>
            {t("sitsDuo.dayOf", "Day {{day}} of {{total}}", { day: dayOf, total })}
          </span>
        </span>
      )}
    </button>
  );
}

/** Bird photo tiles (128px tall) with the name underneath. */
function BirdTiles({ birds }: { birds: SitBird[] }) {
  if (!birds.length) return null;
  return (
    <div className="grid grid-cols-3 gap-3">
      {birds.map((b) => (
        <Link key={b.id} to="/birds/$birdId" params={{ birdId: b.id }} className="flex min-w-0 flex-col gap-1.5" style={{ color: DUO.forest }}>
          <span className="relative block h-32 w-full overflow-hidden rounded-[20px]" style={{ background: DUO.forest }}>
            {b.photo_url
              ? <BirdPhotoCrop url={b.photo_url} original={b.photo_original} position={b.photo_position || BIRD_PHOTO_FOCUS} alt="" />
              : <span aria-hidden="true" className="grid size-full place-items-center text-[28px] font-[700] text-white">{b.name.slice(0, 1).toUpperCase()}</span>}
          </span>
          <span className="truncate text-[15px] font-[700]">{b.name}</span>
        </Link>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="m-0 mb-2.5 text-[13px] font-[700] uppercase tracking-[0.06em]" style={{ color: DUO.quiet }}>{children}</h3>;
}

/** The picked sit. Now: live today (checklist, photos). Coming up and past:
 *  what's set and what happened. Never a gold button (that's on the left). */
function SitCard({ sit, phase, title, caregiver, birds, iOwnSit }: {
  sit: Sit;
  phase: Phase;
  title: string;
  caregiver: string;
  birds: SitBird[];
  iOwnSit: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const resolveNames = useServerFn(resolveHouseholdNames);
  // The sit's own page data (owner-only by RLS), same key as /sits/$sitId.
  const { data, isLoading } = useQuery({
    queryKey: ["sit-detail", sit.id],
    enabled: iOwnSit,
    queryFn: () => fetchSitDetail(sit.id, resolveNames),
  });
  const del = useSitDelete(iOwnSit ? sit : null);

  const household = !!sit.caregiver_user_id;
  const total = durationDays(sit.start_date, sit.end_date);
  const dayOf = Math.min(total, Math.max(1, -daysUntil(sit.start_date) + 1));
  const first = firstWord(caregiver);
  const birdName = new Map(birds.map((b) => [b.id, b.name]));
  const birdLabel = (id: string) => birdName.get(id) ?? t("sitDetail.aBird", "A bird");
  const showLink = iOwnSit && !household && !sit.revoked && !!sit.invite_token && phase !== "past";

  const until = daysUntil(sit.start_date);
  const eyebrow = phase === "now"
    ? t("sitsDuo.liveDayOf", "Live · day {{day}} of {{total}}", { day: dayOf, total })
    : phase === "upcoming"
      ? until === 1 ? t("sitsDuo.startsTomorrow", "Coming up · starts tomorrow") : t("sitsDuo.startsInDays", "Coming up · starts in {{count}} days", { count: until })
      : t("sitsDuo.pastSit", "Past sit");
  const lastAt = data?.activity[0]?.at;

  const footer = iOwnSit ? (
    <div className="flex flex-col items-center gap-3">
      {phase !== "past" && (
        <KyaLink onClick={() => navigate({ to: "/sits/edit/$sitId", params: { sitId: sit.id } })}>{t("sitCards.editSit", "Edit sit")}</KyaLink>
      )}
      <div className="w-full"><DeleteSitControl del={del} /></div>
    </div>
  ) : undefined;

  const preview = iOwnSit && !household && phase !== "past" ? (
    <Link
      to="/sit-preview/$sitId"
      params={{ sitId: sit.id }}
      state={{ previewToken: sit.invite_token ?? null, previewLabel: caregiver, previewHousehold: household } as any}
      className={OUTLINE}
      style={{ borderColor: DUO.forest, color: DUO.forest }}
    >
      <Eye className="size-5" aria-hidden="true" /> {t("sitCards.seeWhatSees", "See what {{name}} sees", { name: first })}
    </Link>
  ) : null;
  const copy = showLink ? (
    <button type="button" onClick={() => void copySitterLink(sit, birds)} className={OUTLINE} style={{ borderColor: DUO.forest, color: DUO.forest }}>
      <Link2 className="size-5" aria-hidden="true" /> {t("sitCards.copyLink", "Copy link")}
    </button>
  ) : null;

  return (
    <PopOutCard eyebrow={eyebrow} title={title} footer={footer}>
      <p className="m-0 text-[16px] leading-[1.5]" style={{ color: DUO.quiet }}>
        {[
          household ? t("sitCards.household", "Household") : t("sitCards.sitter", "Sitter"),
          caregiver,
          rangeTo(t, sit.start_date, sit.end_date),
          t("sitCards.dayCount", "{{count}} days", { count: total }),
        ].join(" · ")}
      </p>
      {phase === "now" && lastAt && (
        <p className="m-0 mt-1 text-[15px] font-[700]" style={{ color: DUO.forest }}>
          {t("sitsDuo.lastUpdate", "Last update {{when}}", { when: fmtWhen(lastAt) })}
        </p>
      )}

      <div className="mt-5 flex flex-col gap-6">
        {phase === "now" && iOwnSit && <LiveToday sit={sit} birds={birds} />}

        <section>
          <SectionLabel>{t("sitDetail.birdsCoveredLabel", "Birds")}</SectionLabel>
          <BirdTiles birds={birds} />
        </section>

        {iOwnSit && phase === "upcoming" && <SitChecklist sit={sit as any} birds={birds} />}

        {iOwnSit && phase !== "now" && (
          isLoading ? (
            <div className="flex items-center gap-2 text-[15px]" style={{ color: DUO.quiet }}><Loader2 className="size-4 animate-spin" /> {t("sitDetail.loading", "Loading…")}</div>
          ) : data?.sit ? (
            <>
              <section>
                <SectionLabel>{t("sitsDuo.inNumbers", "During this sit")}</SectionLabel>
                <div className="grid grid-cols-4 gap-2">
                  <Count label={t("sitDetail.healthChecks", "Health checks")} value={data.counts.scans} />
                  <Count label={t("sitDetail.weights", "Weights")} value={data.counts.weights} />
                  <Count label={t("sitDetail.journal", "Journal")} value={data.counts.journals} />
                  <Count label={t("sitDetail.photos", "Photos")} value={data.counts.photos} />
                </div>
              </section>
              <section>
                <SectionLabel>{t("sitDetail.activity", "Activity")}</SectionLabel>
                <div className="overflow-hidden rounded-[20px] border" style={{ borderColor: DUO.line }}>
                  {data.activity.length === 0 ? (
                    <p className="m-0 p-4 text-[15px]" style={{ color: DUO.quiet }}>{t("sitDetail.noActivity", "No activity logged during this sit.")}</p>
                  ) : (
                    data.activity.map((a, i) => <ActivityRow key={`${a.kind}-${a.id}`} a={a} last={i === data.activity.length - 1} birdLabel={birdLabel} />)
                  )}
                </div>
              </section>
            </>
          ) : null
        )}

        {!iOwnSit && birds.length > 0 && (
          // Covering caregiver / household member: their own care view.
          <div className="flex flex-col gap-2.5">
            {birds.map((b) => (
              <Link key={b.id} to="/birds/$birdId/care-plan" params={{ birdId: b.id }} className={OUTLINE} style={{ borderColor: DUO.forest, color: DUO.forest }}>
                <Eye className="size-5" aria-hidden="true" />
                {birds.length > 1 ? t("sitsDuo.viewNamedCarePlan", "View {{name}}'s care plan", { name: b.name }) : t("sitCards.viewCarePlan", "View care plan")}
              </Link>
            ))}
          </div>
        )}

        {(preview || copy || (iOwnSit && household && phase === "now")) && (
          <div className="flex flex-col gap-2.5">
            {preview}
            {copy}
            {iOwnSit && household && phase === "now" && (
              <Link to="/scans/history" search={{ sitId: sit.id }} className={OUTLINE} style={{ borderColor: DUO.forest, color: DUO.forest }}>
                <Activity className="size-5" aria-hidden="true" /> {t("sitCards.viewHealthChecks", "View health checks")}
              </Link>
            )}
          </div>
        )}
      </div>
    </PopOutCard>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[18px] px-2 py-3 text-center" style={{ background: DUO.bg }}>
      <p className="m-0 text-[22px] font-[700]" style={{ color: DUO.forest }}>{value}</p>
      <p className="m-0 text-[13px] leading-[1.25]" style={{ color: DUO.quiet }}>{label}</p>
    </div>
  );
}

type TodayTask = { id: string; birdId: string; title: string; derived: unknown | null; time_of_day: string | null };

/** What the sitter's checklist records today: each bird's routine tasks with
 *  today's completions, the daily check, and today's photos. */
async function fetchSitToday(sitId: string, birdIds: string[], today: string) {
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const [plansRes, completionsRes, logsRes, photosRes] = await Promise.all([
    birdIds.length ? supabase.from("care_plans").select("id, bird_id").in("bird_id", birdIds) : Promise.resolve({ data: [] as any[] }),
    supabase.from("task_completions").select("routine_task_id").eq("sit_id", sitId).eq("completed_date", today),
    supabase.from("daily_logs").select("bird_id, triage_status").eq("sit_id", sitId).eq("log_date", today),
    supabase.from("photo_logs").select("id, bird_id, photo_url, created_at").eq("sit_id", sitId).gte("created_at", midnight.toISOString()).order("created_at", { ascending: false }).limit(12),
  ]);
  const plans = (plansRes.data ?? []) as { id: string; bird_id: string }[];
  const planToBird = new Map(plans.map((p) => [p.id, p.bird_id]));
  const { data: taskRows } = plans.length
    ? await supabase.from("routine_tasks").select("id, care_plan_id, title, derived, time_of_day, category, sort_order").in("care_plan_id", plans.map((p) => p.id)).order("category").order("sort_order")
    : { data: [] as any[] };
  const tasks: TodayTask[] = ((taskRows ?? []) as any[]).map((r) => ({ id: r.id, birdId: planToBird.get(r.care_plan_id) as string, title: r.title, derived: r.derived ?? null, time_of_day: r.time_of_day ?? null }));
  const photos = (photosRes.data ?? []) as { id: string; bird_id: string; photo_url: string }[];
  const urls = await resolveScanPhotoUrls(supabase.storage, photos.map((p) => p.photo_url));
  return {
    tasks,
    done: new Set(((completionsRes.data ?? []) as any[]).map((c) => c.routine_task_id as string)),
    checked: new Set(((logsRes.data ?? []) as any[]).map((l) => l.bird_id as string)),
    photos: photos.map((p) => ({ id: p.id, url: urls.get(p.photo_url) ?? null })).filter((p): p is { id: string; url: string } => !!p.url),
  };
}

function LiveToday({ sit, birds }: { sit: Sit; birds: SitBird[] }) {
  const { t, i18n } = useTranslation();
  const today = localDateISO();
  const birdIds = birds.map((b) => b.id);
  const { data, isLoading } = useQuery({
    queryKey: ["sits-duo-today", sit.id, today, birdIds.join(",")],
    queryFn: () => fetchSitToday(sit.id, birdIds, today),
    refetchInterval: 60_000,
  });
  const routineT = i18n.getFixedT(i18n.language, "routine");
  const label = (task: TodayTask) => (task.derived ? renderDerivedTask(task.derived as DerivedTask, routineT, i18n.language).title : task.title);

  if (isLoading || !data) {
    return <div className="flex items-center gap-2 text-[15px]" style={{ color: DUO.quiet }}><Loader2 className="size-4 animate-spin" /> {t("sitDetail.loading", "Loading…")}</div>;
  }
  const multi = birds.length > 1;
  return (
    <>
      <section>
        <SectionLabel>{t("sitsDuo.todaysChecklist", "Today's checklist")}</SectionLabel>
        <div className="flex flex-col gap-4">
          {birds.map((b) => {
            const tasks = data.tasks.filter((x) => x.birdId === b.id);
            return (
              <div key={b.id}>
                {multi && <p className="m-0 mb-1.5 text-[15px] font-[700]">{b.name}</p>}
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  <CheckRow done={data.checked.has(b.id)} label={t("sitsDuo.dailyCheck", "Daily health check")} />
                  {tasks.map((x) => <CheckRow key={x.id} done={data.done.has(x.id)} label={label(x)} />)}
                </ul>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <SectionLabel>{t("sitsDuo.todaysPhotos", "Today's photos")}</SectionLabel>
        {data.photos.length === 0 ? (
          <p className="m-0 text-[15px]" style={{ color: DUO.quiet }}>{t("sitsDuo.noPhotosToday", "No photos yet today.")}</p>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            {data.photos.map((p) => (
              <span key={p.id} className="relative block h-32 overflow-hidden rounded-[18px]" style={{ background: DUO.bg }}>
                <img src={p.url} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              </span>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function CheckRow({ done, label }: { done: boolean; label: string }) {
  const { t } = useTranslation();
  return (
    <li className="flex min-h-[48px] items-center gap-3 rounded-[16px] px-3.5 py-2" style={{ background: DUO.bg }}>
      <span
        aria-hidden="true"
        className="grid size-7 shrink-0 place-items-center rounded-full border-2"
        style={done ? { background: K.forest, borderColor: K.forest, color: "#fff" } : { background: "#fff", borderColor: "#b9c7ba" }}
      >
        {done && <Check className="size-4" strokeWidth={3} />}
      </span>
      <span className={`min-w-0 flex-1 text-[15px] leading-[1.35] ${done ? "line-through" : ""}`} style={{ color: done ? DUO.quiet : DUO.forest }}>{label}</span>
      <span className="sr-only">{done ? t("sitsDuo.done", "Done") : t("sitsDuo.notYet", "Not done yet")}</span>
    </li>
  );
}
