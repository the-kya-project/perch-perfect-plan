import type { TFunction } from "i18next";
import { speciesLabel } from "@/lib/speciesLabel";
import { friendlyError } from "@/lib/errorMessage";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { track } from "@/lib/analytics";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { fetchBirdList } from "@/lib/birdListSelect";
import type { SignedPhoto } from "@/lib/birdPhoto";
import {
  Plus, Settings, Users, ChevronRight, Scale, CalendarHeart, Calendar,
  Feather, AlertCircle, AlertTriangle, Check, Sun,
} from "lucide-react";
import { AppOnboarding } from "@/components/AppOnboarding";
import { useTourDemo, DEMO_FLOCK, DEMO_FOSTERS, DEMO_HOUSEHOLD, demoGlanceFor, getDemoToday } from "@/lib/tourDemo";
import { deriveConcernByBird, daysAgo } from "@/lib/scanConcern";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { toast } from "sonner";
import { ASPCA_POISON_CONTROL, isPhoneField, phoneWarning, formatPhoneOnBlur } from "@/lib/emergency";
import { isAddressField } from "@/lib/address";
import { AddressInput } from "@/components/AddressInput";
import { fetchScanFeed, getNotifSeenAt, isUnreadScan } from "@/lib/notificationsFeed";
import { CaregiverCoveringSection, useActiveCaregiver } from "@/components/CaregiverHome";
import { HomeChecklist } from "@/components/HomeChecklist";
import { DailyCheckCard } from "@/components/DailyCheckCard";
import { useDailyCheckToday } from "@/lib/dailyCheck";
import { birdNames, namesAsCount } from "@/lib/birdNames";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaLink, KyaPrimaryButton, KyaAvatarStack, KyaRow, KyaIconTile } from "@/components/kya";
import { TabHeader } from "@/components/headers";
import { HomePushBanner } from "@/components/HomePushBanner";
import { getHouseholdHome, resolveOwnerNames, type HomeHousehold } from "@/lib/home.functions";
import { useMyPermissions } from "@/lib/useCapability";
import {
  groupWeights, weightGlance, upcomingMoments, buildTodayItems, buildHomeStateCopy, daysSince,
  type HomeBird, type WeightEntry, type TodayItem, type UpcomingSit,
} from "@/lib/homeData";
import { formatLocalDate } from "@/lib/dates";
import { useTranslation, Trans } from "react-i18next";
import i18next from "i18next";

const dashboardSearch = z.object({
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
  // Old deep-link to the account emergency sheet: now its own page.
  emergencyDefaults: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: i18next.t("dashboard.pageTitle", "Home — Kya & Co.") }] }),
  validateSearch: dashboardSearch,
  beforeLoad: ({ search }) => {
    if (search.emergencyDefaults) throw redirect({ to: "/account/emergency" });
  },
  component: Dashboard,
});

function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  // One-shot: the inline pre-hydration head script (see __root.tsx) redirects a
  // signed-in owner from "/" to here on cold launch and drops a sessionStorage
  // marker. Report it from the app (PostHog isn't loaded when the inline script
  // runs) so we can confirm the fix on-device instead of guessing.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("kya_cold_redirect");
      if (!raw) return;
      sessionStorage.removeItem("kya_cold_redirect");
      const { path, had_stored } = JSON.parse(raw) ?? {};
      track("cold_launch_redirect", { path: path ?? "/", had_stored: !!had_stored });
    } catch {
      // Never let instrumentation break the dashboard.
    }
  }, []);

  const { data: me } = useQuery({
    queryKey: ["owner-profile-name"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      // select("*") so reading first_name is safe even before its migration is
      // applied (the column is simply absent until then — no query error).
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      return {
        id: u.user.id,
        displayName: (data as any)?.display_name ?? "",
        firstName: ((data as any)?.first_name ?? "").toString().trim(),
      };
    },
  });
  // Prefer the stored first name; fall back to the first token of the full name
  // (existing accounts, or before the migration populates first_name).
  const firstName = (me?.firstName || (me?.displayName ?? "").trim().split(/\s+/)[0]) || "";

  // Bell badge — unread scans (seen state is per-device).
  const { data: scanFeed = [] } = useQuery({ queryKey: ["scan-feed"], queryFn: fetchScanFeed });
  const [notifSeenAt] = useState(() => getNotifSeenAt());
  const myUserId = useMyPermissions().data?.myId;
  const unreadNotifs = scanFeed.filter((n) => isUnreadScan(n, notifSeenAt, myUserId)).length;

  const { data: birds = [], isLoading: birdsLoading } = useQuery({
    queryKey: ["birds"],
    // No per-mount refetch: the 60s staleTime paints from cache on revisit, and
    // every bird mutation (add / hand-off / edit / delete) invalidates ["birds"],
    // so a solo↔flock change still appears immediately without a blocking fetch on
    // every Home visit. Shape is shared with the Sits screen via fetchBirdList.
    queryFn: async () => {
      // Active flock only — a passed bird leaves Home entirely (it lives in the
      // Remembering menu entry; its record is preserved, just not ambient here).
      // The latest weights per bird come embedded in this same request (see
      // fetchBirdList) — no separate home-weights round-trip gated on the ids.
      const { data, error } = await fetchBirdList();
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  // 800px (not 256) so the flock-card crop is byte-for-byte the same image the
  // reposition "Flock card" preview and the bird-record hero use — a smaller
  // transform cropped to a different aspect and broke the WYSIWYG promise.
  const resolvePhoto = useBirdPhotos(birds.map((b) => b.photo_url), 800);

  // Latest weights per bird — pills, stale detection, Today — read straight from
  // the embedded weight_entries on each bird row (no second query). Flattened
  // back to the newest-first array groupWeights expects; weight logging /
  // health-check weigh-ins invalidate ["birds"], so a new weight refreshes Home
  // immediately without a blocking fetch on every visit.
  const allWeights = useMemo<WeightEntry[]>(
    () => (birds as any[]).flatMap((b) => (b.weight_entries ?? []) as WeightEntry[]),
    [birds],
  );

  const { data: sits = [] } = useQuery({
    queryKey: ["all-sits"],
    queryFn: async () => {
      const { data } = await supabase.from("sits").select("id, sitter_name, caregiver_user_id, start_date")
        .or("sitter_name.is.null,sitter_name.neq.__preview__").order("start_date", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const householdFn = useServerFn(getHouseholdHome);
  const { data: household } = useQuery({ queryKey: ["home-household"], queryFn: () => householdFn() });

  // ---- derived ----
  const weightsByBird = useMemo(() => groupWeights(allWeights), [allWeights]);
  const homeBirds = birds as HomeBird[];
  const upcomingSits: UpcomingSit[] = useMemo(
    () => (sits as any[]).map((s) => ({ id: s.id, sitterName: s.sitter_name, startDate: s.start_date, daysUntil: -daysSince(s.start_date) })),
    [sits],
  );
  const moments = useMemo(() => upcomingMoments(homeBirds), [homeBirds]);

  // Derived concerning-health status per bird (from the scan feed) → flock-card
  // pill + Today rows. Cleared by a later all-clear scan or an explicit resolve.
  const concernByBird = useMemo(() => deriveConcernByBird(scanFeed as any), [scanFeed]);
  const todayConcerns = useMemo(
    () => homeBirds.flatMap((b) => {
      const c = concernByBird.get(b.id);
      return c ? [{ birdId: b.id, birdName: b.name, scanId: c.scanId, daysAgo: daysAgo(c.createdAt), runByName: c.runByName }] : [];
    }),
    [homeBirds, concernByBird],
  );
  const todayItems = useMemo(
    () => buildTodayItems(homeBirds, weightsByBird, upcomingSits, moments, todayConcerns),
    [homeBirds, weightsByBird, upcomingSits, moments, todayConcerns],
  );

  const onTodayNavigate = (item: TodayItem) => {
    if (item.to.kind === "scan") navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId: item.to.birdId, scanId: item.to.scanId } });
    else if (item.to.kind === "sits") navigate({ to: "/sits" });
    else if (item.to.kind === "weight") navigate({ to: "/birds/$birdId/weight", params: { birdId: item.to.birdId } });
    else navigate({ to: "/birds/$birdId/moments", params: { birdId: item.to.birdId } });
  };

  // During the onboarding tour, Home shows fixed demo content so every bubble
  // has something to point at (never the user's empty state). Nothing is
  // persisted; real data returns the instant the tour ends.
  const demo = useTourDemo();

  // Flock grouping — determined ONLY by whose birds they are (owner_id vs the
  // current user), NEVER by permission preset/role/capability or whether the
  // viewer owns any birds. Every housemate sees the SAME grouping; only the
  // ACTIONS on tap differ (capability-gated elsewhere, not here). `myId` is used
  // for identity only (the owner_id === me split), not as a permission input.
  const { data: perms } = useMyPermissions();
  const myId = perms?.myId ?? null;
  const ownedBirds = useMemo(() => (myId ? homeBirds.filter((b) => (b as any).owner_id === myId) : homeBirds), [homeBirds, myId]);
  const memberBirds = useMemo(() => (myId ? homeBirds.filter((b) => (b as any).owner_id !== myId) : []), [homeBirds, myId]);

  // Resolve owner display names for the helped-with households (members can't
  // read owner profiles via RLS — goes through the server fn). Owner NAME only;
  // no preset/role/capability is read for grouping or labeling.
  const memberOwnerIds = useMemo(() => [...new Set(memberBirds.map((b) => (b as any).owner_id as string))], [memberBirds]);
  const resolveOwners = useServerFn(resolveOwnerNames);
  const { data: ownerNames } = useQuery({
    queryKey: ["owner-names", memberOwnerIds.slice().sort().join(",")],
    enabled: memberOwnerIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => resolveOwners({ data: { ownerIds: memberOwnerIds } }),
  });
  const memberGroups = useMemo(() => {
    const m = new Map<string, HomeBird[]>();
    for (const b of memberBirds as HomeBird[]) {
      const o = (b as any).owner_id as string;
      const arr = m.get(o) ?? [];
      arr.push(b);
      m.set(o, arr);
    }
    return [...m.entries()].map(([ownerId, birds]) => ({ ownerId, birds, ownerName: ownerNames && ownerId in ownerNames ? (ownerNames[ownerId] || t("dashboard.anOwner", "An owner")) : null }));
  }, [memberBirds, ownerNames, t]);
  // Show the per-household sections whenever OTHER owners' birds are present —
  // independent of whether the viewer owns any (a pure member still gets proper
  // "[Owner]'s household" sections, not a lumped list).
  const showHouseholds = !demo && memberGroups.length > 0;

  // The flock section is always the viewer's OWNED birds (member birds live in
  // the per-household sections). Fosters are an owner concept → owned only.
  const fosterBirds = demo ? DEMO_FOSTERS : ownedBirds.filter((b) => b.is_foster);
  const flockBirds = demo ? DEMO_FLOCK : ownedBirds.filter((b) => !b.is_foster);
  const todayItemsView = demo ? getDemoToday() : todayItems;
  const householdView = demo ? DEMO_HOUSEHOLD : household;
  const glanceFor = (b: HomeBird) => (demo ? demoGlanceFor(b.id) : weightGlance(weightsByBird.get(b.id) ?? [], b.is_foster));
  const photoFor = (b: HomeBird) => (demo ? null : resolvePhoto(b.photo_url));
  // The bird's latest weigh-in for its Home row (the demo tour has a value but no date).
  const latestFor = (b: HomeBird): LatestWeight => {
    if (demo) { const g = glanceFor(b); return g.state === "none" ? null : { grams: g.current, at: null }; }
    const w = weightsByBird.get(b.id)?.[0];
    return w ? { grams: w.grams, at: w.measured_at } : null;
  };

  const { data: caregiver } = useActiveCaregiver();

  // Birds in the daily check: the viewer's own flock and fosters. Birds they
  // help with in someone else's household are checked from the bird page.
  const checkBirds = demo || !myId ? [] : [...flockBirds, ...fosterBirds];
  const { data: dailyToday } = useDailyCheckToday(checkBirds.map((b) => b.id));
  // The daily check card already asks for today's weights, so overdue
  // weigh-ins for those birds leave Today (it keeps sits, concerns, moments).
  const checkIds = new Set(checkBirds.map((b) => b.id));
  const todayPanelItems = todayItemsView.filter((i) => !(i.to.kind === "weight" && checkIds.has(i.to.birdId)));

  // Home body line — state-aware (stale weigh-in → sit imminent → celebration
  // → new bird → weekend → default). Caregiver names for imminent sits come
  // from the household member list already loaded; sitter names from the row.
  const householdNameById = useMemo(
    () => new Map((household?.members ?? []).map((m) => [m.userId, m.name?.trim() || ""])),
    [household],
  );
  const sitsForStateCopy = useMemo(
    () => (sits as any[]).map((s) => ({
      sitterName: s.sitter_name as string | null,
      caregiverName: s.caregiver_user_id ? (householdNameById.get(s.caregiver_user_id) || null) : null,
      startDate: s.start_date as string,
      daysUntil: -daysSince(s.start_date),
    })),
    [sits, householdNameById],
  );
  const stateCopy = birdsLoading ? undefined
    : birds.length === 0 ? t("dashboard.addFirstBirdBody", "Add your first bird to start their record.")
    : buildHomeStateCopy(homeBirds, weightsByBird, sitsForStateCopy, moments);

  // No caregiver "takeover": ONE Home for every account. Owning a bird is derived
  // (birds.owner_id === me), not a signup type — so a caregiver-only account gets
  // the same Home (with "Add a bird" always available; their own birds appear
  // under "Your birds" once they add any). A sit they're actively covering shows
  // as the CaregiverCoveringSection overlay below, never a full-screen takeover
  // that would hide their birds or the add-bird affordance.

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
      <HomeHeader firstName={firstName} unreadNotifs={unreadNotifs} stateCopy={stateCopy} />

      <KyaBody className="gap-6">

        {/* Reminders only reach a phone registered for push, so Home asks until
            it is on (in the app only) — see HomePushBanner. */}
        {!demo && <HomePushBanner birdNames={flockBirds.map((b) => b.name)} />}

        {/* One-time post-setup checklist for new accounts (any type). Self-hides
            when done / dismissed / no longer a new account — see HomeChecklist. */}
        {!demo && <HomeChecklist />}

        {birdsLoading && !demo ? (
          <HomeSkeleton />
        ) : !demo && birds.length === 0 ? (
          <EmptyHome onAdd={() => navigate({ to: "/birds/new" })} />
        ) : (
          // ONE Home for everyone — one bird or twenty. (Previously birds.length
          // === 1 rendered the bird record inline, which stripped the flock list,
          // broke the onboarding tour's owner-flock anchor, and made Home
          // indistinguishable from the bird record. A single bird now shows as one
          // card in the flock, with the same Today / household / guidance.)
          <>
            {/* Daily weight & health check: the box itself for one bird, a
                prompt into the flock check for two or more. */}
            {!demo && checkBirds.length === 1 && (
              <DailyCheckCard
                birdId={checkBirds[0].id}
                name={checkBirds[0].name}
                title={t("dashboard.dailyCheckFor", "{{name}}'s weight and health check", { name: checkBirds[0].name })}
                today={dailyToday?.[checkBirds[0].id]}
                surface="home_one"
              />
            )}
            {!demo && checkBirds.length > 1 && (
              <FlockCheckPrompt
                loading={!dailyToday}
                onOpen={() => navigate({ to: "/check" })}
                onOpenDone={() => navigate({ to: "/check", search: { view: "done" } })}
                birds={checkBirds.map((b) => {
                  const d = dailyToday?.[b.id];
                  return {
                    id: b.id, name: b.name, species: b.species ?? null, photo: photoFor(b), position: b.photo_position,
                    checkedAt: d?.check?.created_at ?? null,
                    overdueDays: (() => { const g = glanceFor(b); return g.state === "stale" ? g.days : null; })(),
                    checked: !!d?.check, triage: d?.check?.triage_status ?? null, grams: d?.weights[0]?.grams ?? null,
                  };
                })}
              />
            )}

            <TodayPanel items={todayPanelItems} onNavigate={onTodayNavigate} />

            {/* A sit you're covering (any account): the sitter-style "Birds in
                your care" cards (per-bird progress; tap a bird to open its
                checklist + health scan). Active window only — the hook returns
                only sits covering today. This is a section on the one shared Home,
                not a takeover. */}
            {!demo && caregiver?.sits?.map((s) => (
              <CaregiverCoveringSection key={s.id} sit={s} />
            ))}

            <section className="space-y-3" data-coach="owner-flock">
              <SectionHeaderCTA title={showHouseholds ? t("dashboard.yourBirds", "Your birds today") : t("dashboard.yourFlock", "Your flock today")} ctaLabel={t("dashboard.addABirdLink", "+ Add a bird")} onCta={() => navigate({ to: "/birds/new" })} />
              {flockBirds.length === 0 ? (
                <p className="px-1 text-[14px]" style={{ color: K.quiet }}>{t("dashboard.noBirdsYet", "No birds yet — start with your first.")}</p>
              ) : (
                <KyaCard>
                  {flockBirds.map((b, i) => (
                    <BirdRow key={b.id} bird={b} photo={photoFor(b)} latest={latestFor(b)} concern={concernByBird.has(b.id)} last={i === flockBirds.length - 1} />
                  ))}
                </KyaCard>
              )}
            </section>

            {/* Birds you help with — one section per distinct owner, shown for
                ANY member of that household regardless of preset. Grouping/labels
                are owner_id-derived only; permissions gate ACTIONS on tap, not this. */}
            {showHouseholds && memberGroups.map((g, gi) => (
              // The member onboarding tour anchors its "birds you help with" and
              // "a household bird" steps to the FIRST household group + its first
              // bird (data-coach). Only the first group is anchored (multi-household
              // members get one sensible target, not a highlight per household).
              <section key={g.ownerId} className="space-y-3" data-coach={gi === 0 ? "member-household" : undefined}>
                <div className="px-1">
                  <KyaHeading size={23}>{householdHeading(t, g.ownerName)}</KyaHeading>
                  <p className="m-0 mt-0.5 text-[13px]" style={{ color: K.quiet }}>{t("dashboard.youHelpHere", "You help here")}</p>
                </div>
                <KyaCard>
                  {g.birds.map((b, bi) =>
                    gi === 0 && bi === 0 ? (
                      <div key={b.id} data-coach="member-household-bird">
                        <BirdRow bird={b} photo={photoFor(b)} latest={latestFor(b)} concern={concernByBird.has(b.id)} last={bi === g.birds.length - 1} />
                      </div>
                    ) : (
                      <BirdRow key={b.id} bird={b} photo={photoFor(b)} latest={latestFor(b)} concern={concernByBird.has(b.id)} last={bi === g.birds.length - 1} />
                    ),
                  )}
                </KyaCard>
              </section>
            ))}

            {fosterBirds.length > 0 && (
              <section className="space-y-3" data-coach="owner-fosters">
                <SectionHeaderCTA
                  title={t("dashboard.inYourCare", "In your care")}
                  pill={fosterBirds.length === 1
                    ? t("dashboard.fosterCountOne", "{{n}} foster", { n: fosterBirds.length })
                    : t("dashboard.fosterCountOther", "{{n}} fosters", { n: fosterBirds.length })}
                  ctaLabel={t("dashboard.takeInABird", "Take in a bird")}
                  onCta={() => navigate({ to: "/birds/new", search: { foster: true } as any })}
                />
                <KyaCard>
                  {fosterBirds.map((b, i) => (
                    <BirdRow key={b.id} bird={b} photo={photoFor(b)} latest={latestFor(b)} foster concern={concernByBird.has(b.id)} last={i === fosterBirds.length - 1} />
                  ))}
                </KyaCard>
              </section>
            )}

            <HouseholdActivity household={householdView} />
            <HouseholdRow household={householdView} firstName={firstName} />
          </>
        )}

        <p className="m-0 px-1 text-[12.5px] leading-[1.45]" style={{ color: K.quiet }}>
          {t("disclaimer.noteLabel", "Note:")} {t("disclaimer.compactBody", "Not a substitute for veterinary care. Call a vet for any medical concern.")}
        </p>
      </KyaBody>
      </div>

      <AppOnboarding />
    </KyaPage>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function HomeHeader({ firstName, stateCopy }: { firstName: string; unreadNotifs: number; stateCopy?: string }) {
  const { t } = useTranslation();
  const h = new Date().getHours();
  // Greetings are spoken-to-the-user copy: no terminal period.
  const part = h < 12 ? t("dashboard.goodMorning", "Good morning") : h < 18 ? t("dashboard.goodAfternoon", "Good afternoon") : t("dashboard.goodEvening", "Good evening");
  const greeting = firstName ? t("dashboard.greetingWithName", "{{part}}, {{name}}", { part, name: firstName }) : part;
  // Tab header rule: no label above the title. The date leads the line under
  // it when there's no state copy.
  const dateLabel = formatLocalDate(new Date(), { weekday: "long", month: "long", day: "numeric" });
  return (
    <TabHeader title={greeting} line={stateCopy || dateLabel} />
  );
}

// ---------------------------------------------------------------------------
// Section header: a Newsreader heading with a moss text link on the right.
// ---------------------------------------------------------------------------
function SectionHeaderCTA({ title, pill, ctaLabel, onCta }: { title: string; pill?: string; ctaLabel: string; onCta: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <KyaHeading size={23} className="inline-flex items-center gap-2">
        {title}
        {pill && <span className="rounded-full px-2.5 py-1 text-[12px] font-[700]" style={{ background: K.lime, color: K.forest, fontFamily: "inherit" }}>{pill}</span>}
      </KyaHeading>
      <KyaLink onClick={onCta}>{ctaLabel}</KyaLink>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today panel (adaptive — hidden entirely when empty)
// ---------------------------------------------------------------------------
type PromptBird = { id: string; name: string; species: string | null; photo: SignedPhoto | null; position?: string | null; checked: boolean; checkedAt: string | null; triage: string | null; grams: number | null; overdueDays: number | null };

// Up to 4 birds show in one row; a bigger flock collapses into a tappable bar.
const ROW_MAX = 4;
// Overdue weigh-ins are red; amber stays for health results.
const OVERDUE_RED = "#a32d2d";
// The red "over a week" line on the bar counts birds weighed more than this many days ago.
const WEEK_DAYS = 7;

function avatar(b: PromptBird, size: number, initialPx: number) {
  return b.photo
    ? <BirdPhotoCrop url={b.photo.url} original={b.photo.original} position={b.position} alt="" />
    : <span className="grid size-full place-items-center font-[500] text-white/90" style={{ fontSize: initialPx, width: size, height: size }}>{b.name.slice(0, 1).toUpperCase()}</span>;
}

// The Home prompt into the flock check. Up to four birds: one row with each
// bird's status. Five or more: one bar of overlapping photos that opens the
// list, with up to two summary lines under it. Once every bird is checked the
// button opens the all-done summary.
function FlockCheckPrompt({ birds, loading, onOpen, onOpenDone }: { birds: PromptBird[]; loading: boolean; onOpen: () => void; onOpenDone: () => void }) {
  const { t } = useTranslation();
  const total = birds.length;
  const done = birds.filter((b) => b.checked).length;
  const allDone = !loading && done >= total;
  const grams = (n: number) => t("dashboard.gramsShort", "{{n}} g", { n: n.toLocaleString() });
  return (
    <section className="space-y-3.5 rounded-[22px] bg-[var(--lime)] p-[18px]" style={{ boxShadow: "0 12px 26px -14px rgba(45,106,79,.55)" }}>
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[var(--ink)] text-[var(--lime)]">
          <Sun className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-[500] text-[var(--ink)]">{t("dashboard.dailyHealthCheck", "Daily health check")}</p>
          <p className="mt-0.5 text-[12px] text-[#2b3a31]">{t("dashboard.flockCheckBody", "Grab a weight and a quick once-over of your birds.")}</p>
        </div>
      </div>

      {total > ROW_MAX ? (
        <FlockBar birds={birds} done={done} onOpen={allDone ? onOpenDone : onOpen} />
      ) : (
        <div className="grid grid-cols-4 gap-x-1">
          {birds.map((b) => (
            <span key={b.id} className="flex min-w-0 flex-col items-center gap-[3px]">
              <span className="relative size-[46px] shrink-0">
                <span
                  className="relative block size-[46px] overflow-hidden rounded-full"
                  style={{ background: gradientFor(b.species || b.name), boxShadow: `0 0 0 ${b.overdueDays != null ? `2.5px ${OVERDUE_RED}` : b.checked ? "2.5px var(--ink)" : "2px #fff"}` }}
                  aria-hidden="true"
                >
                  {avatar(b, 46, 15)}
                </span>
                {/* Badges live on the photo: overdue weigh-in wins over done. */}
                {b.overdueDays != null ? (
                  <span className="absolute -bottom-[3px] -right-[3px] grid size-[18px] place-items-center rounded-full text-white" style={{ background: OVERDUE_RED, boxShadow: "0 0 0 2px var(--lime)" }} aria-hidden="true">
                    <Scale className="size-[10px]" strokeWidth={2.6} />
                  </span>
                ) : b.checked ? (
                  <span className="absolute -bottom-[3px] -right-[3px] grid size-[18px] place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)]" style={{ boxShadow: "0 0 0 2px var(--lime)" }} aria-hidden="true">
                    <Check className="size-[10px]" strokeWidth={3.2} />
                  </span>
                ) : null}
              </span>
              <span className="mt-[3px] max-w-full truncate text-[11.5px] font-[500] text-[var(--ink)]">{b.name}</span>
              <span className="max-w-full text-center text-[10.5px] font-[500] leading-[1.25] text-[#2b3a31]">
                {b.checked ? t("dashboard.checked", "Checked") : t("dashboard.needsDailyCheck", "Needs daily check")}
              </span>
              {b.checked && b.grams != null && (
                <span className="max-w-full text-center text-[10.5px] font-[500] leading-[1.25] text-[var(--ink)]">{grams(b.grams)}</span>
              )}
              {b.overdueDays != null && (
                <span className="max-w-full text-center text-[10.5px] font-[700] leading-[1.25]" style={{ color: OVERDUE_RED }}>
                  {t("dashboard.notWeighedInDays", "Not weighed in {{count}} days", { count: b.overdueDays })}
                </span>
              )}
            </span>
          ))}
        </div>
      )}

      <KyaPrimaryButton onClick={allDone ? onOpenDone : onOpen}>
        {allDone
          ? t("dashboard.seeTodaysChecksButton", "See today's checks")
          : done > 0
            ? t("dashboard.flockCheckFinish", "Finish your flock check ({{done}} of {{total}} done)", { done, total })
            : t("dashboard.flockCheckCta", "Weigh & check your flock")}
      </KyaPrimaryButton>
    </section>
  );
}

// Five or more birds: four overlapping photos and a "+n" circle in one white
// bar (tap opens the list), then who still needs checking and who hasn't been
// weighed in over a week.
function FlockBar({ birds, done, onOpen }: { birds: PromptBird[]; done: number; onOpen: () => void }) {
  const { t } = useTranslation();
  const total = birds.length;
  // Overdue weigh-ins first, then not checked yet, then checked.
  const rank = (b: PromptBird) => (b.overdueDays != null ? 0 : b.checked ? 2 : 1);
  const ordered = [...birds].sort((a, b) => rank(a) - rank(b) || (b.overdueDays ?? 0) - (a.overdueDays ?? 0));
  const shown = ordered.slice(0, 4);
  const more = total - shown.length;
  const left = total - done;
  const overWeek = ordered.filter((b) => b.overdueDays != null && b.overdueDays > WEEK_DAYS).map((b) => b.name);
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-label={t("dashboard.openDailyCheckList", "Open the daily check list ({{done}} of {{total}} checked)", { done, total })}
        className="flex w-full items-center gap-2 rounded-[18px] border-0 bg-white px-3 py-2.5 text-left"
      >
        <span className="flex flex-1 items-center pl-[14px]">
          {shown.map((b) => (
            <span
              key={b.id}
              className="relative -ml-[14px] block size-[52px] shrink-0 overflow-hidden rounded-full"
              style={{ background: gradientFor(b.species || b.name), border: "3px solid var(--lime)", boxShadow: b.overdueDays != null ? `0 0 0 2.5px ${OVERDUE_RED}` : undefined }}
              aria-hidden="true"
            >
              {avatar(b, 46, 16)}
            </span>
          ))}
          {more > 0 && (
            <span className="relative -ml-[14px] grid size-[52px] shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[15px] font-[700] text-[var(--lime)]" style={{ border: "3px solid var(--lime)" }} aria-hidden="true">
              +{more}
            </span>
          )}
        </span>
        <ChevronRight className="size-5 shrink-0 text-[var(--ink)]" aria-hidden="true" />
      </button>
      <div className="space-y-2">
        <p className="flex items-center gap-2.5 text-[14px] text-[var(--ink)]">
          {left === 0 ? (
            <span className="grid size-[26px] shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)]" aria-hidden="true"><Check className="size-3.5" strokeWidth={3} /></span>
          ) : (
            <span className="size-[26px] shrink-0 rounded-full border-2 border-[var(--ink)] bg-white" aria-hidden="true" />
          )}
          <span>
            {left === 0
              ? t("dashboard.allBirdsCheckedToday", "All {{count}} birds checked today", { count: total })
              : t("dashboard.birdsStillNeedCheck", "{{count}} birds still need a daily check and weight", { count: left })}
          </span>
        </p>
        {overWeek.length > 0 && (
          <p className="flex items-center gap-2.5 text-[14px] font-[500]" style={{ color: OVERDUE_RED }}>
            <span className="grid size-[26px] shrink-0 place-items-center rounded-full text-white" style={{ background: OVERDUE_RED }} aria-hidden="true"><Scale className="size-3.5" strokeWidth={2.4} /></span>
            <span>
              {namesAsCount(overWeek)
                ? t("dashboard.nBirdsNotWeighedWeek", "{{count}} birds haven't been weighed in over a week", { count: overWeek.length })
                : t("dashboard.namesNotWeighedWeek", "{{names}} haven't been weighed in over a week", { names: birdNames(t, overWeek), count: overWeek.length })}
            </span>
          </p>
        )}
      </div>
    </>
  );
}

function TodayPanel({ items, onNavigate }: { items: TodayItem[]; onNavigate: (i: TodayItem) => void }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <section data-coach="owner-today" className="overflow-hidden rounded-[20px] bg-white" style={{ color: K.forest }}>
      <div className="flex items-baseline justify-between px-4 pb-3 pt-4">
        <KyaHeading size={21}>{t("dashboard.today", "Today")}</KyaHeading>
        <span className="text-[13px]" style={{ color: K.quiet }}>{items.length === 1 ? t("dashboard.thingCountOne", "{{n}} thing", { n: items.length }) : t("dashboard.thingCountOther", "{{n}} things", { n: items.length })}</span>
      </div>
      <ul className="m-0 list-none p-0" style={{ borderTop: `1px solid ${K.line}` }}>
        {items.map((it, i) => (
          <li key={it.id}>
            <KyaRow
              onClick={() => onNavigate(it)}
              last={i === items.length - 1}
              leading={
                <KyaIconTile tone={it.tone === "amber" ? "amber" : "forest"}>
                  {it.to.kind === "scan" ? <AlertTriangle className="size-[18px]" /> : it.tone === "amber" ? <AlertCircle className="size-[18px]" /> : it.to.kind === "sits" ? <Calendar className="size-[18px]" /> : <CalendarHeart className="size-[18px]" />}
                </KyaIconTile>
              }
              title={it.title}
              detail={it.meta}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Bird / foster card
// ---------------------------------------------------------------------------
const GRADIENTS = [
  ["#cdeab0", "#a7d68f"], ["#d6e8dc", "#aecdbb"], ["#e8dcc0", "#d2c19a"],
  ["#cfe0e8", "#a8c5d2"], ["#e6d4d0", "#cfb0aa"],
];
function gradientFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = GRADIENTS[h % GRADIENTS.length];
  return `linear-gradient(135deg,${a},${b})`;
}

type LatestWeight = { grams: number; at: string | null } | null;
// A weigh-in older than this many days reads red on the Home row.
const HOME_STALE_DAYS = 7;

function BirdThumb({ photo, name, species, position }: { photo: SignedPhoto | null; name: string; species: string | null; position?: string | null }) {
  const initial = (name?.slice(0, 1) ?? "?").toUpperCase();
  return (
    <span className="relative block size-[52px] shrink-0 overflow-hidden rounded-[14px]" style={{ background: gradientFor(species || name) }}>
      {photo ? (
        <BirdPhotoCrop url={photo.url} original={photo.original} position={position} alt="" />
      ) : (
        <span className="grid size-full place-items-center text-[20px] font-[600] text-white/90">{initial}</span>
      )}
    </span>
  );
}

/** "Sarah's household" / "Chris' household". The English possessive picks
 *  between two keys so translators get a plain {{name}} (Dutch can't reuse the
 *  English "'s"). */
function householdHeading(t: TFunction, ownerName: string | null | undefined): string {
  const n = ownerName?.trim();
  if (!n) return t("dashboard.aHouseholdYouHelpWith", "A household you help with");
  return /s$/i.test(n)
    ? t("dashboard.ownersHouseholdS", "{{name}}' household", { name: n })
    : t("dashboard.ownersHousehold", "{{name}}'s household", { name: n });
}

/** One bird in the Home list: photo, name and species, then the latest weight
 *  and when it was taken (red past a week). The weight trend lives on the
 *  weight page. */
function BirdRow({ bird, photo, latest, foster, concern, last }: { bird: HomeBird; photo: SignedPhoto | null; latest: LatestWeight; foster?: boolean; concern?: boolean; last?: boolean }) {
  const { t } = useTranslation();
  const days = latest?.at ? daysAgo(latest.at) : null;
  const stale = days != null && days > HOME_STALE_DAYS;
  const when = days == null ? null
    : days <= 0 ? t("dashboard.weighedToday", "Weighed today")
    : days === 1 ? t("dashboard.weighedYesterday", "Yesterday")
    : t("dashboard.weighedDaysAgo", "{{count}} days ago", { count: days });
  return (
    <Link
      to="/birds/$birdId" params={{ birdId: bird.id }}
      className="flex min-h-[72px] items-center gap-3 px-4 py-2.5 active:bg-black/[0.03]"
      style={{ borderBottom: last ? undefined : `1px solid ${K.line}`, color: K.forest }}
    >
      <BirdThumb photo={photo} name={bird.name} species={bird.species} position={bird.photo_position} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-[700]">{bird.name}</span>
        <span className="block truncate text-[13px]" style={{ color: K.quiet }}>
          {bird.species ? speciesLabel(t, bird.species) : t("dashboard.parrot", "Parrot")}
          {foster && bird.intake_date ? ` · ${t("dashboard.withYouSince", "With you since {{date}}", { date: fmtShort(bird.intake_date) })}` : ""}
        </span>
        {concern && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[12.5px] font-[700]" style={{ color: K.amberText }}>
            <AlertTriangle className="size-3.5" aria-hidden="true" /> {t("dashboard.concernFlagged", "Concern flagged")}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        {latest ? (
          <>
            <span className="block text-[15px] font-[700]">{t("dashboard.gramsShort", "{{n}} g", { n: latest.grams.toLocaleString() })}</span>
            {when && <span className={`block text-[13px] ${stale ? "font-[700]" : ""}`} style={{ color: stale ? K.red : K.quiet }}>{when}</span>}
          </>
        ) : (
          <span className="block text-[13px]" style={{ color: K.quiet }}>{t("dashboard.noWeightsYet", "No weights yet")}</span>
        )}
      </span>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// From your household (activity, last 48h)
// ---------------------------------------------------------------------------
/** The verb phrase for one household activity row ("logged 120 g", …). */
function activitySummary(t: TFunction, a: HomeHousehold["activity"][number]): string {
  if (a.kind === "weight") return t("dashboard.activityLoggedWeight", "logged {{grams}} g", { grams: a.grams });
  if (a.kind === "scan") return t("dashboard.activityRanCheck", "ran a health check");
  return a.journalTitle
    ? t("dashboard.activityJournalNoteTitled", "added a journal note — {{title}}", { title: a.journalTitle })
    : t("dashboard.activityJournalNote", "added a journal note");
}

function HouseholdActivity({ household }: { household?: HomeHousehold }) {
  const { t } = useTranslation();
  const activity = household?.activity ?? [];
  if (!household || household.members.length === 0 || activity.length === 0) return null;
  return (
    <section className="space-y-2">
      <KyaHeading size={23} className="px-1">{t("dashboard.fromYourHousehold", "From your household")}</KyaHeading>
      <ul className="m-0 list-none space-y-1.5 p-0">
        {activity.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5 rounded-[20px] bg-white px-4 py-3">
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: "var(--house)" }} />
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[15px] leading-[1.45]" style={{ color: K.ink }}><span className="font-[700]" style={{ color: K.forest }}>{a.actorName || t("dashboard.activitySomeone", "Someone")}</span> {t("dashboard.activitySummary", "{{summary}} for {{bird}}", { summary: activitySummary(t, a), bird: a.birdName ?? t("dashboard.activityABird", "A bird") })}</p>
              <p className="m-0 mt-0.5 text-[13px]" style={{ color: K.quiet }}>{fmtAgo(a.at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quiet Household row → account-level /household screen
// ---------------------------------------------------------------------------
function HouseholdRow({ household, firstName }: { household?: HomeHousehold; firstName: string }) {
  const { t } = useTranslation();
  const members = household?.members ?? [];
  const youInitial = (firstName.slice(0, 1) || "Y").toUpperCase();
  const hasMembers = members.length > 0;
  const names = members.map((m) => m.name?.trim()).filter(Boolean) as string[];

  const who = !hasMembers
    ? null
    : names.length === 1
      ? t("dashboard.youAndOne", "You and {{a}}", { a: names[0] })
      : names.length === 2
        ? t("dashboard.youAndTwo", "You, {{a}} and {{b}}", { a: names[0], b: names[1] })
        : t("dashboard.youAndOthers", "You and {{count}} others", { count: members.length });
  const sharing = !hasMembers
    ? t("dashboard.addSomeoneWhoHelps", "Add someone who helps care for your birds")
    : household?.scope === "all" || !household?.sharedBirdNames.length
      ? t("dashboard.sharingAllYourBirds", "Sharing all your birds")
      : t("dashboard.sharingNames", "Sharing {{names}}", { names: joinNames(household.sharedBirdNames) });

  return (
    <Link to="/household" data-coach="owner-household" className="flex min-h-[68px] items-center gap-3 rounded-[20px] bg-white px-4 py-3 active:bg-black/[0.03]" style={{ color: K.forest }}>
      {hasMembers ? (
        <KyaAvatarStack initials={[youInitial, ...members.slice(0, 2).map((m) => (m.name?.slice(0, 1) || "?").toUpperCase())]} />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-full" style={{ background: K.mist, color: K.moss }}><Users className="size-[18px]" /></span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-[700]">{t("dashboard.household", "Household")}</span>
        <span className="block text-[13px] leading-[1.4]" style={{ color: K.quiet }}>{[who, sharing].filter(Boolean).join(" · ")}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" style={{ color: K.quiet }} aria-hidden="true" />
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Foster footer
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Empty + skeleton — the empty card carries the one main button, "Add your
// first bird".
// ---------------------------------------------------------------------------
function EmptyHome({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <KyaCard className="px-5 py-7 text-center" style={{ color: K.forest }}>
      <div className="flex justify-center"><KyaIconTile size={52}><Feather className="size-6" /></KyaIconTile></div>
      <KyaHeading size={24} className="mt-3">{t("dashboard.welcomeToYourFlock", "Welcome to your flock")}</KyaHeading>
      <p className="mx-auto m-0 mt-2 max-w-[34ch] text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("dashboard.emptyHomeBodyNoArrow", "Start their living record — care plan, weight, moments, and more.")}</p>
      <div className="mt-5">
        <KyaPrimaryButton onClick={onAdd} icon={<Plus className="size-[18px]" />}>{t("dashboard.addYourFirstBird", "Add your first bird")}</KyaPrimaryButton>
      </div>
    </KyaCard>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-[20px] bg-white p-3">
          <div className="size-[52px] shrink-0 animate-pulse rounded-[14px] bg-[#e3ebe2]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-[#e3ebe2]" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-[#e3ebe2]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function fmtShort(iso: string): string {
  return formatLocalDate(new Date(`${iso.slice(0, 10)}T12:00:00`), { month: "short", day: "numeric", year: "numeric" });
}
function fmtAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 60000));
  if (mins < 60) return i18next.t("dashboard.minAgo", "{{n}} min ago", { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) {
    return hrs === 1
      ? i18next.t("dashboard.hoursAgoOne", "{{n}} hour ago", { n: hrs })
      : i18next.t("dashboard.hoursAgoOther", "{{n}} hours ago", { n: hrs });
  }
  return i18next.t("dashboard.yesterday", "yesterday");
}
function joinNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return i18next.t("dashboard.yourBirdsLower", "your birds");
  return birdNames(i18next.t, n);
}
