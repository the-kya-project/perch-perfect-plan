import { friendlyError } from "@/lib/errorMessage";
import { basicsDone, setupStarted, resumeStep } from "@/lib/setupProgress";
import { setupStepNumber } from "@/components/SetupShell";
import { speciesLabel } from "@/lib/speciesLabel";
import { birdAgeLabel } from "@/lib/birdAge";
import { useTranslation, Trans } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { createFileRoute, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { purgeBirdMedia } from "@/lib/birdMedia.functions";
import { birdMediaPurgeFailedText } from "@/lib/i18n/serverErrors";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useBirdRole } from "@/lib/useBirdRole";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { useCapability } from "@/lib/useCapability";
import { AgePicker, BirdField } from "@/components/BirdPickers";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { PhotoCropper } from "@/components/PhotoCropper";
import { useServerFn } from "@tanstack/react-start";
import { getPendingHandoff, cancelHandoff, makePermanent } from "@/lib/handoff.functions";
import { BirdPhotoSheet } from "@/components/BirdPhotoSheet";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { toast } from "sonner";
import {
  Scale, BookOpen, IdCard, CalendarHeart, ClipboardList,
  FileText, Pencil, ArrowRight, Camera, ChevronLeft, ChevronRight,
  Check, X, Heart, Loader2, Crop, HeartCrack, Siren, HandHeart, Trash2,
} from "lucide-react";
import { formatLocalDate } from "@/lib/dates";
import { useDailyCheckToday, type BirdToday } from "@/lib/dailyCheck";
import { K, KyaPage, KyaCard, KyaHeading, KyaIconButton, KyaLink, KyaPrimaryButton, KyaSecondaryButton, KyaRow, KyaTag, KyaAvatarStack, KyaSheet, KyaLabel, KyaIconTile } from "@/components/kya";
import { HeaderPill } from "@/components/headers";
import { daysAgo } from "@/lib/scanConcern";
import { useCarePlanStatus } from "@/lib/useCarePlanStatus";
import { useLoggedBy } from "@/lib/useLoggedBy";
import { birdNames } from "@/lib/birdNames";
import { getHouseholdForBird } from "@/lib/household.functions";
import { useOwnerEmergency } from "@/lib/useOwnerEmergency";
import { emergencyDifferent } from "@/lib/emergency";

// Bird-record home — the new landing when you tap a bird. A glanceable hub for
// the living record; the care plan is one facet among several. Facet screens
// (weight, journal, identity, moments, vet summary) are stubs for now.

export const Route = createFileRoute("/_authenticated/birds/$birdId/")({
  head: () => ({ meta: [{ title: i18next.t("birdRecord.pageTitle", "Bird record — Kya & Co.") }] }),
  component: BirdRecordHome,
});


// Shared bird-record query — used by the route header and the body. Same
// queryKey/select, so calling it in both places is deduped by React Query.
export function useBirdRecord(birdId: string) {
  return useQuery({
    queryKey: ["bird-record", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, name, species, age, sex, flight_status, birth_date, photo_url, photo_position, setup_complete, setup_step, is_foster, became_permanent_on, intake_date")
        .eq("id", birdId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
}

function BirdRecordHome() {
  const { birdId } = Route.useParams();
  const { data: bird, isPending, fetchStatus } = useBirdRecord(birdId);

  // Offline, React Query PAUSES the query (its default networkMode), so it never
  // settles: `isPending` stays true forever and the no-access guard below never
  // runs. The page then sat on its `bird?.name ?? "This bird"` fallback and
  // rendered a convincing but empty record — "This bird · Parrot", "No weight
  // yet — log the first" — for a bird that may well have weights. On a health
  // record that is worse than a blank screen: it reads as data loss, and it
  // invites logging a duplicate weight.
  if (isPending && fetchStatus === "paused") return <BirdOffline />;

  // A bird you can no longer read comes back as `data: null` with `error: null`
  // — RLS filters the row out rather than failing the request, exactly like the
  // blocked-UPDATE case. Without this guard the page fell through to its
  // `bird?.name ?? "This bird"` fallback and rendered a complete but empty
  // record: hero, facet rows, working-looking links, no bird. Reachable by the
  // previous owner after a handoff (a bookmark, or Back), by a household member
  // whose access was removed, and by any stale link to a deleted bird.
  if (!isPending && !bird) return <BirdNoAccess />;

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <BirdRecordHero birdId={birdId} />
        <main className="flex flex-col gap-4 px-4 pb-6 pt-4">
          <BirdRecordBody birdId={birdId} />
          <MemberContextBanner birdId={birdId} />
        </main>
      </div>
    </KyaPage>
  );
}

/**
 * Offline: say so, rather than showing an empty record that looks like data loss.
 *
 * Deliberately has NO "Try again" button. While the query is paused, refetch()
 * is paused too — React Query resumes it from its own onlineManager, not from a
 * caller — so the button would sit there doing nothing, which is the failure
 * this whole screen exists to avoid. Resuming on reconnect is React Query's
 * documented behaviour; it could not be verified in the test harness, because
 * onlineManager reads the real browser events and a synthetic `navigator.onLine`
 * override does not reach it. The copy therefore promises only what is certain:
 * nothing is lost.
 */
function BirdOffline() {
  const { t } = useTranslation();
  return (
    <KyaPage>
      <div className="mx-auto grid min-h-screen max-w-md place-items-center px-4 text-center">
        <KyaCard className="w-full px-5 py-6">
          <KyaHeading as="h1" size={26}>{t("birdRecord.youReOffline", "You're offline")}</KyaHeading>
          <p className="m-0 mx-auto mt-3 max-w-[28rem] text-[15px] leading-[1.5]" style={{ color: K.ink }}>
            {t("birdRecord.thisRecordNeedsAConnection", "This record needs a connection. Nothing has been lost — it'll be here when you're back.")}
          </p>
        </KyaCard>
      </div>
    </KyaPage>
  );
}

/** Deliberately does not say whether the bird exists — only that it isn't yours. */
function BirdNoAccess() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <KyaPage>
      <div className="mx-auto grid min-h-screen max-w-md place-items-center px-4 text-center">
        <KyaCard className="w-full px-5 py-6">
          <KyaHeading as="h1" size={26}>{t("birdRecord.thisRecordIsnTYours", "This record isn't yours anymore")}</KyaHeading>
          <p className="m-0 mx-auto mt-3 max-w-[28rem] text-[15px] leading-[1.5]" style={{ color: K.ink }}>
            {t("birdRecord.youMayHaveHandedThis", "You may have handed this bird off, or your access may have been removed. If you think that's wrong, ask whoever looks after the record now.")}
          </p>
          <div className="mt-5">
            <KyaPrimaryButton onClick={() => navigate({ to: "/dashboard" })}>
              {t("birdRecord.backToYourFlock", "Back to your flock")}
            </KyaPrimaryButton>
          </div>
        </KyaCard>
      </div>
    </KyaPage>
  );
}

// Hero card: the bird's photo in a rounded card (16px gutters, so the framing
// matches what the owner set and heads aren't cut off), a dark forest fade at
// the bottom, and the name with species · sex · age. Page-header rule: back top
// left, at most one labeled action pill top right (owner: edit photo). No logo,
// help, bell or account icons here.
function BirdRecordHero({ birdId }: { birdId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Back goes UP the hierarchy, not back in history: the bird's own pages
  // (weight, identity, …) navigate here rather than back, so history would
  // bounce between the two. Home, or Remembering when the visitor came from a
  // memorial card (router state set by that row).
  const fromRemembering = useLocation({ select: (l) => !!(l.state as any)?.fromRemembering });
  const fallback = useCallback(() => navigate({ to: fromRemembering ? "/remembering" : "/dashboard" }), [navigate, fromRemembering]);
  const goBack = fallback;
  const role = useBirdRole(birdId);
  const isOwner = role === "owner";
  const { data: bird } = useBirdRecord(birdId);
  const photoOf = useBirdPhotos([bird?.photo_url], 800);
  const photo = photoOf(bird?.photo_url);
  const name = bird?.name ?? t("birdRecord.thisBird", "This bird");
  const sexKey = (bird?.sex ?? "").toLowerCase();
  const identity = [
    bird?.species ? speciesLabel(t, bird.species) : null,
    sexKey === "male" ? t("birdRecord.male", "Male") : sexKey === "female" ? t("birdRecord.female", "Female") : null,
    birdAgeLabel(t, bird) ? t("birdRecord.ageOld", "{{age}} old", { age: birdAgeLabel(t, bird) }) : null,
    bird?.is_foster && bird?.intake_date ? t("birdRecord.withYouSince", "With you since {{date}}", { date: fmtMonthYear(bird.intake_date) }) : null,
  ].filter(Boolean).join(" · ");
  const [photoSheet, setPhotoSheet] = useState(false);

  return (
    <>
      {/* Status-bar-safe top padding so the card never clips. */}
      <div className="px-4 pt-[calc(env(safe-area-inset-top)+14px)]">
      <div className="relative h-[380px] w-full overflow-hidden rounded-[22px]" style={{ background: K.forest }}>
        {photo?.url ? (
          <BirdPhotoCrop url={photo.url} original={photo.original} position={bird?.photo_position} alt={name} eager />
        ) : (
          // No photo: solid forest with a muted parrot mark.
          <div className="absolute inset-0 grid place-items-center">
            <img src="/brand/parrot-lime.svg" alt="" aria-hidden className="w-20 opacity-25" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%]" style={{ background: "linear-gradient(to top, rgba(26,61,46,0.96), transparent)" }} />

        <div className="absolute inset-x-0 top-[14px] flex items-center justify-between gap-3 px-[14px]">
          <KyaIconButton label={t("birdRecord.back", "Back")} onClick={goBack}>
            <ChevronLeft className="size-6" aria-hidden="true" />
          </KyaIconButton>
          {isOwner && bird && (
            <HeaderPill action={{ label: t("birdRecord.editPhoto", "Edit photo"), icon: <Camera className="size-4" aria-hidden="true" />, onClick: () => setPhotoSheet(true) }} />
          )}
        </div>

        <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
          {bird?.is_foster && <p className="m-0 mb-1 text-[14px]" style={{ color: K.teal }}>{t("birdRecord.inYourCareText", "In your care")}</p>}
          <KyaHeading as="h1" size={38} className="text-white">{name}</KyaHeading>
          {identity && <p className="m-0 mt-1.5 text-[15px] text-white/90">{identity}</p>}
        </div>
      </div>
      </div>

      {photoSheet && bird && (
        <BirdPhotoSheet
          birdId={birdId}
          ownerId={bird.owner_id}
          currentPhoto={bird.photo_url ?? null}
          currentPosition={bird.photo_position ?? null}
          displayUrl={photo?.url ?? null}
          onClose={() => setPhotoSheet(false)}
        />
      )}
    </>
  );
}

type WeightRow = { id: string; grams: number; measured_at: string; source: string; logged_by: string | null; sit_id: string | null };
type CheckRow = { id: string; log_date: string; triage_status: string; created_at: string; source: string | null; run_by: string | null; sit_id: string | null };

// A weigh-in older than this many days reads red.
const STALE_DAYS = 7;

/** "Today", "Yesterday" or "[n] days ago". */
function whenLabel(t: TFunction, iso: string): string {
  const d = daysAgo(iso);
  if (d <= 0) return t("birdRecord.whenToday", "Today");
  if (d === 1) return t("birdRecord.whenYesterday", "Yesterday");
  return t("birdRecord.whenDaysAgo", "{{count}} days ago", { count: d });
}

// The bird-record body without the hero.
export function BirdRecordBody({ birdId }: { birdId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = useBirdRole(birdId);
  const isOwner = role === "owner";
  // Capability gates (mirror RLS): show write affordances members actually have.
  const canHealth = useCapability("record_health", { birdId });
  // Emergency info row: custom for this bird, or the account's.
  const { data: emContacts } = useQuery({
    queryKey: ["contacts", birdId],
    queryFn: async () => {
      const { data } = await supabase.from("emergency_contacts").select("*").eq("bird_id", birdId).maybeSingle();
      return data;
    },
  });
  const { data: emDefaults } = useOwnerEmergency();
  const emCustom = emergencyDifferent(emContacts, emDefaults);
  const canEditPlan = useCapability("edit_care_plans", { birdId });
  const canFlock = useCapability("manage_flock", { birdId });
  // Covering an active sit for this bird (household caregiver) — gates the
  // "something's wrong" entry on the SITUATION, not the account type.
  const activeSitId = useActiveSitIdForBird(birdId);

  const { data: bird } = useBirdRecord(birdId);
  const { data: dailyToday } = useDailyCheckToday([birdId]);
  const planStatus = useCarePlanStatus(birdId);

  const { data: weights } = useQuery({
    queryKey: ["bird-weights", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_entries")
        .select("id, grams, measured_at, source, logged_by, sit_id")
        .eq("bird_id", birdId)
        .order("measured_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as WeightRow[];
    },
  });

  const { data: checkins } = useQuery({
    queryKey: ["bird-checkins", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_logs")
        .select("id, log_date, triage_status, created_at, source, run_by, sit_id")
        .eq("bird_id", birdId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data ?? []) as CheckRow[];
    },
  });

  const photoOf = useBirdPhotos([bird?.photo_url], 256);
  const photo = photoOf(bird?.photo_url);

  // One-time "adjust crop" nudge for photos with no explicit focal point yet
  // (photo_position null = predates focal points / never repositioned → renders
  // centered, which crops off-centre birds poorly). Repositioning sets a
  // position (clearing the condition); dismissing is remembered per bird.
  const [photoSheet, setPhotoSheet] = useState(false);
  const nudgeKey = `focal-nudge:${birdId}`;
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try { return typeof window !== "undefined" && window.localStorage.getItem(nudgeKey) === "1"; } catch { return false; }
  });
  const showFocalNudge = isOwner && !!bird?.photo_url && !bird?.photo_position && !nudgeDismissed;
  function dismissNudge() {
    try { window.localStorage.setItem(nudgeKey, "1"); } catch { /* ignore */ }
    setNudgeDismissed(true);
  }

  const weightCount = weights?.length ?? 0;

  // Weights and checks, newest first.
  const recent = [
    ...(weights ?? []).map((w) => ({ kind: "weight" as const, at: w.measured_at, id: `w-${w.id}`, rawId: w.id, grams: w.grams, status: null as string | null, by: w.logged_by, source: w.source as string | null, sitId: w.sit_id })),
    ...(checkins ?? []).map((c) => ({ kind: "checkin" as const, at: c.created_at, id: `c-${c.id}`, rawId: c.id, grams: null as number | null, status: c.triage_status, by: c.run_by, source: c.source ?? "sitter", sitId: c.sit_id })),
  ].sort((a, b) => +new Date(b.at) - +new Date(a.at)).slice(0, 12);
  const loggedBy = useLoggedBy(recent, isOwner);
  const [showAllRecent, setShowAllRecent] = useState(false);
  const recentShown = showAllRecent ? recent : recent.slice(0, 4);

  const name = bird?.name ?? t("birdRecord.thisBird", "This bird");

  return (
    <>
      <SummaryCard birdId={birdId} weights={weights} today={dailyToday?.[birdId]} canCheck={canHealth} />

      {/* Fresh bird → guide straight into the care plan. Prominent but skippable. */}
      {bird && !bird.setup_complete && canEditPlan && (
        // After the stop point ("Set up later") the basics are in, so the invite
        // picks up at the pet-sitter details instead of starting over at Food.
        <KyaCard className="p-4">
          {basicsDone(bird.setup_step, bird.setup_complete) ? (
            <>
              <KyaHeading size={21}>{t("birdRecord.basicsSet", "The basics are set for {{name}}", { name })}</KyaHeading>
              <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("birdRecord.addSitterDetailsBody", "Add behavior, tips, and {{name}}'s day so a pet sitter has everything they need.", { name })}</p>
              <div className="mt-3.5">
                <KyaPrimaryButton icon={<ClipboardList className="size-5" />} onClick={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: setupStepNumber("personality") } })}>
                  {t("birdRecord.addSitterDetails", "Add pet-sitter details")}
                </KyaPrimaryButton>
              </div>
            </>
          ) : setupStarted(bird.setup_step) ? (
            <>
              <KyaHeading size={21}>{t("birdRecord.continueCarePlanTitle", "Continue {{name}}'s care plan", { name })}</KyaHeading>
              <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("birdRecord.continueCarePlanIntro", "Pick up where you left off. What you've added so far is saved.")}</p>
              <div className="mt-3.5">
                <KyaPrimaryButton icon={<ClipboardList className="size-5" />} onClick={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: resumeStep(bird.setup_step) } })}>
                  {t("birdRecord.continueCarePlan", "Continue care plan")}
                </KyaPrimaryButton>
              </div>
            </>
          ) : (
            <>
              <KyaHeading size={21}>{t("birdRecord.setUpCarePlan", "Set up {{name}}'s care plan", { name })}</KyaHeading>
              <p className="m-0 mt-1.5 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{t("birdRecord.buildCarePlanIntro", "Build {{name}}'s care plan so sitters and household members know exactly what to do. You can skip and set it up later.", { name })}</p>
              <div className="mt-3.5">
                <KyaPrimaryButton icon={<ClipboardList className="size-5" />} onClick={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: 1 } })}>
                  {t("birdRecord.createCarePlan", "Create care plan")}
                </KyaPrimaryButton>
              </div>
            </>
          )}
        </KyaCard>
      )}

      {/* One-time "adjust crop" nudge for photos that have no focal point yet. */}
      {showFocalNudge && (
        <div className="flex items-center gap-3 rounded-[20px] p-3" style={{ background: K.amberBg }}>
          <Crop className="size-5 shrink-0" style={{ color: K.amberText }} />
          <button type="button" onClick={() => setPhotoSheet(true)} className="min-h-[44px] min-w-0 flex-1 text-left">
            <span className="block text-[14px] font-[700]" style={{ color: K.amberText }}>{t("birdRecord.adjustCrop", "Adjust crop")}</span>
            <span className="block text-[13px]" style={{ color: K.amberText }}>{t("birdRecord.makeSureTheBirdS", "Make sure the bird's face is centered.")}</span>
          </button>
          <button type="button" onClick={dismissNudge} aria-label={t("birdRecord.dismiss", "Dismiss")} className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full" style={{ color: K.amberText }}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Welcome to the flock — foster-fail, near the top (not destructive). */}
      {canFlock && bird?.is_foster && <HandoffSection birdId={birdId} name={name} part="welcome" />}

      {/* [Bird]'s record */}
      <KyaCard>
        <KyaHeading size={21} className="px-4 pb-1 pt-4">{t("birdRecord.recordHeading", "{{name}}'s record", { name })}</KyaHeading>
        {bird?.setup_complete && (
          <KyaRow
            leading={<KyaIconTile size={38}><ClipboardList className="size-5" /></KyaIconTile>}
            title={t("birdRecord.carePlan", "Care plan")}
            detail={t("birdRecord.carePlanSections", "Food, health, behavior, tips and day")}
            trailing={planStatus.loaded
              ? planStatus.todo.length === 0
                ? <KyaTag tone="lime">{t("birdRecord.planReady", "Ready")}</KyaTag>
                : <KyaTag tone="amber">{t("birdRecord.planToFinish", "{{count}} to finish", { count: planStatus.todo.length })}</KyaTag>
              : undefined}
            chevron={false}
            onClick={() => navigate({ to: "/birds/$birdId/plan", params: { birdId } })}
          />
        )}
        <KyaRow leading={<KyaIconTile size={38}><Scale className="size-5" /></KyaIconTile>} title={t("birdRecord.weight", "Weight")} detail={weightCount > 0 ? (weightCount === 1 ? t("birdRecord.entryCount", "{{n}} entry", { n: weightCount }) : t("birdRecord.entriesCount", "{{n}} entries", { n: weightCount })) : t("birdRecord.notStarted", "Not started")} onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })} />
        <KyaRow leading={<KyaIconTile size={38}><BookOpen className="size-5" /></KyaIconTile>} title={t("birdRecord.journal", "Journal")} detail={t("birdRecord.moltMedsVetVisits", "Molt, meds, vet visits")} onClick={() => navigate({ to: "/birds/$birdId/journal", params: { birdId } })} />
        <KyaRow leading={<KyaIconTile size={38}><IdCard className="size-5" /></KyaIconTile>} title={t("birdRecord.identity", "Identity")} detail={t("birdRecord.chipBandHatchDateOrigin", "Chip, band, hatch date, origin, photo")} onClick={() => navigate({ to: "/birds/$birdId/identity", params: { birdId } })} />
        <KyaRow leading={<KyaIconTile size={38}><CalendarHeart className="size-5" /></KyaIconTile>} title={t("birdRecord.moments", "Moments")} detail={t("birdRecord.markTheDaysWorthRemembering", "Mark the days worth remembering")} onClick={() => navigate({ to: "/birds/$birdId/moments", params: { birdId } })} />
        <KyaRow leading={<KyaIconTile size={38}><Siren className="size-5" /></KyaIconTile>} title={t("birdRecord.emergencyInfo", "Emergency info")} detail={emCustom ? t("birdRecord.emergencyCustom", "Custom for {{name}}", { name }) : t("birdRecord.emergencyShared", "Uses your emergency info")} onClick={() => navigate({ to: "/birds/$birdId/emergency", params: { birdId } })} />
        <KyaRow leading={<KyaIconTile size={38}><FileText className="size-5" /></KyaIconTile>} title={t("birdRecord.vetSummary", "Vet summary")} detail={t("birdRecord.oneCleanSheetForThe", "One clean sheet for the vet")} onClick={() => navigate({ to: "/birds/$birdId/vet-summary", params: { birdId } })} last />
      </KyaCard>

      {/* About [bird] — Species / Age / Hatch date / Sex / Flight (owner-editable). */}
      {bird && <BasicInfoCard birdId={birdId} bird={bird} name={name} editable={canFlock} />}

      {/* Recent */}
      <KyaCard id="bird-recent">
        <div className="flex items-center justify-between gap-3 px-4 pt-3">
          <KyaHeading size={21}>{t("birdRecord.recent", "Recent")}</KyaHeading>
          {recent.length > 4 && (
            <KyaLink onClick={() => setShowAllRecent((v) => !v)}>
              {showAllRecent ? t("birdRecord.showFewer", "Show fewer") : t("birdRecord.seeAll", "See all")}
            </KyaLink>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="m-0 px-4 pb-4 pt-1 text-[14px]" style={{ color: K.quiet }}>{t("birdRecord.nothingLoggedYetWeightsAnd", "Nothing logged yet. Weights and sitter check-ins will show up here.")}</p>
        ) : (
          <ul className="m-0 list-none p-0 pb-1">
            {recentShown.map((r, i) => (
              <li key={r.id} style={{ borderBottom: i === recentShown.length - 1 ? undefined : `1px solid ${K.line}` }}>
                <button
                  type="button"
                  // A check opens its detail; a weight opens the weight history.
                  onClick={r.kind === "checkin"
                    ? () => navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId, scanId: r.rawId } })
                    : () => navigate({ to: "/birds/$birdId/weight", params: { birdId } })}
                  className="flex min-h-[52px] w-full items-center gap-3 px-4 py-2 text-left active:bg-black/[0.03]"
                  style={{ color: K.forest }}
                >
                  <span className="w-[58px] shrink-0 text-[13px]" style={{ color: K.quiet }}>{shortDay(t, r.at)}</span>
                  <span className="min-w-0 flex-1 text-[14px]">
                    {r.kind === "weight"
                      ? <>{t("birdRecord.recentWeighed", "Weighed")} · <b className="font-[700]">{t("birdRecord.grams", "{{n}} g", { n: r.grams?.toLocaleString() })}</b></>
                      : <>{t("birdRecord.recentDailyCheck", "Daily check")} · {checkinLabel(t, r.status ?? "green")}</>}
                  </span>
                  <span className="max-w-[40%] shrink-0 truncate text-right text-[13px]" style={{ color: K.quiet }}>{loggedBy(t, r)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </KyaCard>

      {/* Who can see [bird] — owner only */}
      {isOwner && <WhoCanSeeCard birdId={birdId} name={name} />}

      {/* If things change: hand off, mark as passed, delete — one card of rows. */}
      {canFlock && bird && (
        <section className="flex flex-col gap-2.5 pt-1">
          <KyaHeading size={21} className="px-1">{t("birdRecord.ifThingsChangeHeading", "If things change for {{name}}", { name })}</KyaHeading>
          <KyaCard>
            <HandoffSection birdId={birdId} name={name} part="handoff" pronoun={pronounOf(bird.sex)} />
            {/* Mark as passed — owner-only. Opens the gentle confirm flow; the
                record is preserved as a memorial, never deleted. */}
            {isOwner && (
              <ChangeRow
                icon={<Heart className="size-5" />}
                tileBg={K.mist}
                iconColor={K.forest}
                title={t("birdRecord.markNameAsPassed", "Mark {{name}} as passed", { name })}
                detail={passedDetail(t, pronounOf(bird.sex))}
                onClick={() => navigate({ to: "/birds/$birdId/farewell", params: { birdId } })}
              />
            )}
            <DeleteBirdButton birdId={birdId} name={name} pronoun={pronounOf(bird.sex)} />
          </KyaCard>
        </section>
      )}

      {/* Something's wrong — for whoever is COVERING an active sit for this
          bird (household member in charge). Gated on the situation, not the
          account type. Hidden for the owner and for members not covering a sit. */}
      {activeSitId && !isOwner && bird && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => navigate({ to: "/birds/$birdId/concern", params: { birdId } })}
            className="flex min-h-[56px] w-full items-center gap-3 rounded-[20px] bg-white px-4 text-left active:scale-[0.99]"
            style={{ color: K.forest }}
          >
            <HeartCrack className="size-5 shrink-0" style={{ color: K.quiet }} />
            <span className="flex-1 text-[15px] font-[700]">{t("birdRecord.somethingsWrong", "Something's wrong with {{name}}", { name })}</span>
            <ArrowRight className="size-4 shrink-0" style={{ color: K.quiet }} />
          </button>
          <p className="m-0 mt-1.5 px-1 text-[13px]" style={{ color: K.quiet }}>{t("birdRecord.passedOrTrouble", "If {{name}} has passed or is in serious trouble", { name })}</p>
        </div>
      )}

      {/* Reposition the bird's photo (opened from the adjust-crop nudge). */}
      {photoSheet && bird && (
        <BirdPhotoSheet
          birdId={birdId}
          ownerId={bird.owner_id}
          currentPhoto={bird.photo_url ?? null}
          currentPosition={bird.photo_position ?? null}
          displayUrl={photo?.url ?? null}
          startAdjusting
          onClose={() => setPhotoSheet(false)}
        />
      )}
    </>
  );
}

/** Weight, last weighed and today's check, then the two ways into a check:
 *  the daily check (sunflower) and the full health check (white). Today's
 *  status lives in the third tile, which opens the check once it's done. */
function SummaryCard({ birdId, weights, today, canCheck }: { birdId: string; weights?: WeightRow[]; today?: BirdToday; canCheck: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const latest = weights?.[0];
  const days = latest ? daysAgo(latest.measured_at) : null;
  const stale = days != null && days > STALE_DAYS;
  const check = today?.check ?? null;
  const tile = "flex min-h-[74px] flex-col justify-center rounded-[14px] px-3 py-2.5 text-left";
  const label = "block text-[12.5px]";
  const value = "mt-0.5 block text-[17px] font-[700]";
  const checkBtn = "inline-flex min-h-[48px] items-center justify-center rounded-full border-2 px-2 text-center text-[15px] font-[700] leading-tight active:scale-[0.99]";
  return (
    <KyaCard className="p-3.5" style={{ boxShadow: "0 10px 24px -16px rgba(18,41,31,.45)" }}>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })} className={`${tile} active:opacity-80`} style={{ background: K.mist, color: K.forest }}>
          <span className={label} style={{ color: K.quiet }}>{t("birdRecord.tileWeight", "Weight")}</span>
          <span className={value}>{latest ? t("birdRecord.grams", "{{n}} g", { n: latest.grams.toLocaleString() }) : "—"}</span>
        </button>
        <div className={tile} style={{ background: K.mist, color: K.forest }}>
          <span className={label} style={{ color: K.quiet }}>{t("birdRecord.tileLastWeighed", "Last weighed")}</span>
          <span className={value} style={stale ? { color: K.red } : undefined}>{latest ? whenLabel(t, latest.measured_at) : t("birdRecord.notYet", "Not yet")}</span>
        </div>
        {check ? (
          <button type="button" onClick={() => navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId, scanId: check.id } })} className={`${tile} active:opacity-80`} style={{ background: K.mist, color: K.forest }}>
            <span className={label} style={{ color: K.quiet }}>{t("birdRecord.tileDailyCheck", "Daily check")}</span>
            <span className={value}>{t("birdRecord.checkDone", "Done")}</span>
          </button>
        ) : (
          <div className={tile} style={{ background: K.mist, color: K.forest }}>
            <span className={label} style={{ color: K.quiet }}>{t("birdRecord.tileDailyCheck", "Daily check")}</span>
            <span className={value}>{t("birdRecord.notYet", "Not yet")}</span>
          </div>
        )}
      </div>
      {canCheck && (
        <>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => navigate({ to: "/check", search: { bird: birdId } })}
              className={checkBtn}
              style={{ background: K.sunflower, borderColor: K.forest, color: K.forest }}
            >
              {t("birdRecord.dailyCheckButton", "Daily check")}
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: "/birds/$birdId/scan", params: { birdId } })}
              className={checkBtn}
              style={{ background: "#fff", borderColor: K.forest, color: K.forest }}
            >
              {t("birdRecord.fullHealthCheckButton", "Full health check")}
            </button>
          </div>
          <p className="m-0 mt-2 px-0.5 text-[12.5px] leading-[1.45]" style={{ color: K.quiet }}>
            {t("birdRecord.checkButtonsHint", "Daily check has an “all good” shortcut. The full check walks through all 10 questions, the same one a sitter does.")}
          </p>
        </>
      )}
    </KyaCard>
  );
}

/** Who can see [bird]: the owner and the household members it's shared with. */
function WhoCanSeeCard({ birdId, name }: { birdId: string; name: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const getHousehold = useServerFn(getHouseholdForBird);
  const { data: household } = useQuery({
    queryKey: ["household", birdId],
    queryFn: () => getHousehold({ data: { birdId } }),
    staleTime: 60_000,
  });
  const members = (household?.members ?? []) as Array<{ userId: string; name: string | null; email: string | null }>;
  const labels = members.map((m) => m.name || m.email?.split("@")[0] || t("birdRecord.someone", "someone"));
  const names = labels.length === 0
    ? t("birdRecord.justYou", "Just you")
    : labels.length > 3
      ? t("birdRecord.youAndCount", "You and {{count}} others", { count: labels.length })
      : t("birdRecord.youAndNames", "You and {{names}}", { names: birdNames(t, labels) });
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/birds/$birdId/access", params: { birdId } })}
      className="flex min-h-[68px] w-full items-center gap-3 rounded-[20px] bg-white px-4 py-3 text-left active:bg-black/[0.03]"
      style={{ color: K.forest }}
    >
      <KyaAvatarStack initials={[t("birdRecord.youInitial", "Y"), ...labels.slice(0, 2).map((l) => l.slice(0, 1).toUpperCase())]} />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-[700]">{t("birdRecord.whoCanSeeName", "Who can see {{name}}", { name })}</span>
        <span className="block text-[13px]" style={{ color: K.quiet }}>{names}</span>
      </span>
      <span className="shrink-0 text-[15px] font-[700]" style={{ color: K.moss }}>{t("birdRecord.manage", "Manage")}</span>
    </button>
  );
}

function checkinLabel(t: TFunction, status: string): string {
  return status === "red"
    ? t("birdRecord.recentConcern", "Concern flagged")
    : status === "yellow"
      ? t("birdRecord.recentSomethingToCheck", "Something to check")
      : t("birdRecord.recentAllNormal", "All normal");
}

/** "Today" or "Oct 18". */
function shortDay(t: TFunction, iso: string): string {
  return daysAgo(iso) <= 0 ? t("birdRecord.whenToday", "Today") : fmtDate(iso);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return formatLocalDate(d, { month: "short", day: "numeric" });
}

function fmtMonthYear(iso: string): string {
  return formatLocalDate(new Date(`${iso.slice(0, 10)}T12:00:00`), { month: "short", year: "numeric" });
}

type Pronoun = "him" | "her" | "them";

/** Object pronoun from birds.sex ("Male"/"male"/"m", "Female"/"female"/"f"),
 *  matched on the first letter; anything else (or nothing) → them. */
function pronounOf(sex: string | null | undefined): Pronoun {
  const k = (sex ?? "").trim().toLowerCase().charAt(0);
  return k === "m" ? "him" : k === "f" ? "her" : "them";
}

function handoffDetail(t: TFunction, name: string, p: Pronoun): string {
  return p === "him"
    ? t("birdRecord.handoffDetailHim", "{{name}}'s record goes with him", { name })
    : p === "her"
      ? t("birdRecord.handoffDetailHer", "{{name}}'s record goes with her", { name })
      : t("birdRecord.handoffDetailThem", "{{name}}'s record goes with them", { name });
}

function passedDetail(t: TFunction, p: Pronoun): string {
  return p === "him"
    ? t("birdRecord.passedDetailHis", "Keep his record and moments as a memorial")
    : p === "her"
      ? t("birdRecord.passedDetailHer", "Keep her record and moments as a memorial")
      : t("birdRecord.passedDetailTheir", "Keep their record and moments as a memorial");
}

function deleteDetail(t: TFunction, name: string, p: Pronoun): string {
  return p === "him"
    ? t("birdRecord.deleteDetailHim", "Removes {{name}} and everything logged for him", { name })
    : p === "her"
      ? t("birdRecord.deleteDetailHer", "Removes {{name}} and everything logged for her", { name })
      : t("birdRecord.deleteDetailThem", "Removes {{name}} and everything logged for them", { name });
}

/** The line in the delete confirmation. One key per pronoun so translations
 *  can inflect the whole sentence. */
function deleteConfirmLine(t: TFunction, name: string, p: Pronoun): string {
  return p === "him"
    ? t("birdRecord.deleteConfirmHim", "This removes {{name}} and everything logged for him. You can't undo this.", { name })
    : p === "her"
      ? t("birdRecord.deleteConfirmHer", "This removes {{name}} and everything logged for her. You can't undo this.", { name })
      : t("birdRecord.deleteConfirmThem", "This removes {{name}} and everything logged for them. You can't undo this.", { name });
}

/** One 62px row in the "If things change" card: 40px tile, title, one-line detail, chevron. */
function ChangeRow({ icon, tileBg, iconColor, title, detail, onClick, danger, last }: {
  icon: React.ReactNode;
  tileBg: string;
  iconColor: string;
  title: React.ReactNode;
  detail: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[62px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-black/[0.03]"
      style={{ borderBottom: last ? undefined : `1px solid ${K.line}`, color: K.forest }}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ background: tileBg, color: iconColor }} aria-hidden="true">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-[700]" style={danger ? { color: K.red } : undefined}>{title}</span>
        <span className="mt-0.5 block truncate text-[13px]" style={{ color: K.quiet }}>{detail}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" style={{ color: danger ? K.red : K.quiet }} aria-hidden="true" />
    </button>
  );
}

// Handoff + foster-fail actions, split by `part`:
//   "welcome"  → the foster-fail "Welcome to the flock" button (stays near the
//                top; it's not destructive, so it's separate from the More group).
//   "handoff"  → the pending-handoff row, else a "Hand [name] off" row. Lives
//                in the bottom "If things change" card alongside Delete.
function HandoffSection({ birdId, name, part, pronoun = "them" }: { birdId: string; name: string; part: "welcome" | "handoff"; pronoun?: Pronoun }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const getPending = useServerFn(getPendingHandoff);
  const cancel = useServerFn(cancelHandoff);
  const permanent = useServerFn(makePermanent);
  const navigate = useNavigate();

  const { data: pending } = useQuery({
    queryKey: ["pending-handoff", birdId],
    queryFn: () => getPending({ data: { birdId } }),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancel({ data: { handoffId: id } }),
    onSuccess: () => { toast.success(t("birdRecord.handoffCanceled", "Handoff canceled.")); qc.invalidateQueries({ queryKey: ["pending-handoff", birdId] }); },
    onError: (e: any) => toast.error(friendlyError(e, t("birdRecord.couldntCancel", "Couldn't cancel."))),
  });
  const permanentM = useMutation({
    mutationFn: () => permanent({ data: { birdId } }),
    onSuccess: () => {
      toast.success(t("birdRecord.joinedFlockToast", "{{name}} joined the flock! 🎉", { name }));
      ["bird-record", "moments", "birds", "bird-role"].forEach((k) => qc.invalidateQueries({ queryKey: k === "birds" ? ["birds"] : [k, birdId] }));
    },
    onError: (e: any) => toast.error(friendlyError(e, t("birdRecord.couldntUpdate", "Couldn't update."))),
  });

  const outlineBtn = "flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 bg-white text-[16px] font-[700] active:scale-[0.99] disabled:opacity-50";

  if (part === "welcome") {
    return (
      <button
        type="button"
        disabled={permanentM.isPending}
        onClick={() => { if (window.confirm(t("birdRecord.makePermanentConfirm", "Make {{name}} a permanent member of your flock? You can change your mind later.", { name }))) permanentM.mutate(); }}
        className={outlineBtn}
        style={{ borderColor: K.forest, color: K.forest }}
      >
        <Heart className="size-4" /> {t("birdRecord.welcomeToFlock", "Welcome to the flock")}
      </button>
    );
  }

  // part === "handoff"
  if (pending?.pending) {
    return (
      <div className="flex min-h-[62px] w-full items-center gap-3 px-4 py-2.5" style={{ borderBottom: `1px solid ${K.line}`, background: K.amberBg }}>
        <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-white/60" style={{ color: K.amberText }} aria-hidden="true">
          <Loader2 className="size-5" />
        </span>
        <p className="m-0 min-w-0 flex-1 text-[13px]" style={{ color: K.amberText }}>
          <Trans i18nKey="birdRecord.handoffPendingTo" defaults="Handoff pending — to <1>{{email}}</1>" values={{ email: pending.pending.email }} components={{ 1: <span className="font-[700] [overflow-wrap:anywhere]" /> }} />
        </p>
        <button type="button" disabled={cancelM.isPending} onClick={() => cancelM.mutate(pending.pending!.id)} className="min-h-[44px] shrink-0 px-1 text-[14px] font-[700] underline disabled:opacity-50" style={{ color: K.amberText }}>
          {t("birdRecord.cancel", "Cancel")}
        </button>
      </div>
    );
  }
  return (
    <ChangeRow
      icon={<HandHeart className="size-5" />}
      tileBg={K.lime}
      iconColor={K.forest}
      title={t("birdRecord.handOffToNewOwner", "Hand {{name}} off to a new owner", { name })}
      detail={handoffDetail(t, name, pronoun)}
      onClick={() => navigate({ to: "/birds/$birdId/handoff", params: { birdId } })}
    />
  );
}

// "Delete [name]" row for the bottom "If things change" card — red, opens the
// type-the-name confirmation before the destructive cascade (same flow as the
// editor's Danger zone). No accidental taps: delete is gated on an exact match.
function DeleteBirdButton({ birdId, name, pronoun = "them" }: { birdId: string; name: string; pronoun?: Pronoun }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [text, setText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const purgeMedia = useServerFn(purgeBirdMedia);
  const ready = text.trim() === name.trim();

  async function del() {
    if (!ready) { toast.error(t("birdRecord.typeNameToConfirm", "Type \"{{name}}\" exactly to confirm.", { name })); return; }
    setDeleting(true);
    // Media BEFORE rows: the rows are the only record of these files and clip
    // uids, so a failure here must abort with the bird intact rather than
    // orphan them permanently. Same ordering as deleteAccount.
    //
    // Its own catch, separate from the row deletes below: the shared message
    // says the bird is still here, which is only true when THIS step fails.
    try {
      await purgeMedia({ data: { birdId } });
    } catch (e: any) {
      console.error("[deleteBird] media purge failed", e);
      toast.error(birdMediaPurgeFailedText());
      setDeleting(false);
      return;
    }
    try {
      const { data: plans } = await supabase.from("care_plans").select("id").eq("bird_id", birdId);
      const planIds = (plans ?? []).map((p: any) => p.id);
      await supabase.from("sit_birds").delete().eq("bird_id", birdId);
      await supabase.from("weight_logs").delete().eq("bird_id", birdId);
      await supabase.from("photo_logs").delete().eq("bird_id", birdId);
      await supabase.from("daily_logs").delete().eq("bird_id", birdId);
      await supabase.from("emergency_contacts").delete().eq("bird_id", birdId);
      if (planIds.length) await supabase.from("routine_tasks").delete().in("care_plan_id", planIds);
      await supabase.from("care_plans").delete().eq("bird_id", birdId);
      const { error } = await supabase.from("birds").delete().eq("id", birdId);
      if (error) throw error;
      toast.success(t("birdRecord.removedToast", "{{name}} removed.", { name }));
      qc.invalidateQueries({ queryKey: ["birds"] });
      navigate({ to: "/dashboard" });
    } catch (e: any) {
      toast.error(friendlyError(e, t("birdRecord.couldntDelete", "Couldn't delete.")));
      setDeleting(false);
    }
  }

  return (
    <>
      <ChangeRow
        icon={<Trash2 className="size-5" />}
        tileBg="#fbe9e9"
        iconColor={K.red}
        title={t("birdRecord.deleteName", "Delete {{name}}", { name })}
        detail={deleteDetail(t, name, pronoun)}
        onClick={() => setConfirming(true)}
        danger
        last
      />
      {confirming && (
        // Dismissing (backdrop, Escape, Close) is the same as "Keep" and is
        // blocked while the delete runs. The type-the-name gate is unchanged:
        // Delete stays disabled until the name matches exactly.
        <KyaSheet
          onClose={() => { if (!deleting) { setConfirming(false); setText(""); } }}
          closeLabel={t("birdRecord.close", "Close")}
          title={<KyaHeading size={24}>{t("birdRecord.deleteNameQ", "Delete {{name}}?", { name })}</KyaHeading>}
          footer={
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={deleting || !ready}
                onClick={del}
                className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 px-6 text-[16px] font-[700] text-white disabled:opacity-45"
                style={{ background: K.red, borderColor: K.red }}
              >
                {deleting ? t("birdRecord.deleting", "Deleting…") : t("birdRecord.deleteName", "Delete {{name}}", { name })}
              </button>
              <KyaSecondaryButton className="w-full" disabled={deleting} onClick={() => { setConfirming(false); setText(""); }}>
                {t("birdRecord.keepName", "Keep {{name}}", { name })}
              </KyaSecondaryButton>
            </div>
          }
        >
          <p className="m-0 text-[15px] leading-[1.5]" style={{ color: K.ink }}>{deleteConfirmLine(t, name, pronoun)}</p>
          <div className="mt-4 flex flex-col gap-1.5">
            <KyaLabel htmlFor="delete-confirm">{t("birdRecord.typeToConfirm", "Type {{name}} to confirm", { name })}</KyaLabel>
            <input
              id="delete-confirm"
              className="kya-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={name}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>
        </KyaSheet>
      )}
    </>
  );
}

const FLIGHT_LABEL: Record<string, string> = {
  unknown: "Unknown",
  fully_flighted: "Fully flighted",
  clipped: "Clipped",
  partially_clipped: "Partially clipped",
};

// Basic info card — the bird's species, age, hatch date, sex, and flight,
// editable inline. The fields write to the same birds.* columns the Identity
// facet reads, so any edit here auto-fills the Identity tab and vice versa
// (no fork). Age and Hatch date are coupled via the shared AgePicker — picking
// a hatch date auto-derives age; clearing it re-enables the Age dropdown.
function BasicInfoCard({ birdId, bird, name, editable = true }: { birdId: string; bird: { species?: string | null; age?: string | null; sex?: string | null; flight_status?: string | null; birth_date?: string | null }; name: string; editable?: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    species: bird.species ?? "",
    age: bird.age ?? "",
    sex: bird.sex ?? "",
    flight_status: bird.flight_status ?? "unknown",
    birth_date: bird.birth_date ?? "",
  });

  function openEdit() {
    // Re-seed from latest props so the form shows current values, not stale state
    // from a previous edit cycle.
    setF({
      species: bird.species ?? "",
      age: bird.age ?? "",
      sex: bird.sex ?? "",
      flight_status: bird.flight_status ?? "unknown",
      birth_date: bird.birth_date ?? "",
    });
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    const clean = (v: string) => (v.trim() ? v.trim() : null);
    const { error } = await supabase.from("birds").update({
      species: clean(f.species),
      age: clean(f.age),
      sex: clean(f.sex),
      flight_status: f.flight_status || "unknown",
      birth_date: f.birth_date || null,
    } as any).eq("id", birdId);
    setSaving(false);
    if (error) { toast.error(friendlyError(error)); return; }
    // Refresh every surface that displays these fields so changes appear
    // immediately on the Identity tab, the dashboard cards, and elsewhere.
    qc.invalidateQueries({ queryKey: ["bird-record", birdId] });
    qc.invalidateQueries({ queryKey: ["bird-identity", birdId] });
    qc.invalidateQueries({ queryKey: ["bird", birdId] });
    qc.invalidateQueries({ queryKey: ["birds"] });
    toast.success(t("birdRecord.saved", "Saved."));
    setEditing(false);
  }

  // null = not added yet (shows "Not added" and an Add link).
  const speciesView = (bird.species?.trim() && speciesLabel(t, bird.species.trim())) || null;
  const ageView = birdAgeLabel(t, bird);
  // Setup saves "Male"/"Female"; look up case-insensitively.
  const sexKey = (bird.sex ?? "").toLowerCase();
  const sexView = sexKey === "male" ? t("birdRecord.male", "Male") : sexKey === "female" ? t("birdRecord.female", "Female") : sexKey === "unknown" ? t("birdRecord.unknown", "Unknown") : (bird.sex || null);
  const flightKey = bird.flight_status ?? "unknown";
  // "unknown" is the column's default, so it reads as not added.
  const flightView =
    flightKey === "fully_flighted" ? t("birdRecord.fullyFlighted", "Fully flighted")
    : flightKey === "clipped" ? t("birdRecord.clipped", "Clipped")
    : flightKey === "partially_clipped" ? t("birdRecord.partiallyClipped", "Partially clipped")
    : flightKey !== "unknown" && FLIGHT_LABEL[flightKey] ? FLIGHT_LABEL[flightKey]
    : null;
  const hatchView = bird.birth_date
    ? formatLocalDate(new Date(`${bird.birth_date}T12:00:00`), { month: "short", day: "numeric", year: "numeric" })
    : null;
  const rows: [string, string | null][] = [
    [t("birdRecord.species", "Species"), speciesView],
    [t("birdRecord.age", "Age"), ageView],
    [t("birdRecord.hatchDate", "Hatch date"), hatchView],
    [t("birdRecord.sex", "Sex"), sexView],
    [t("birdRecord.flight", "Flight"), flightView],
  ];

  return (
    <KyaCard>
      <div className="flex items-center justify-between gap-3 px-4 pt-3">
        <KyaHeading size={21}>{t("birdRecord.aboutName", "About {{name}}", { name })}</KyaHeading>
        {editing ? (
          <div className="flex gap-1">
            <KyaLink color={K.quiet} onClick={() => setEditing(false)}>{t("birdRecord.cancel", "Cancel")}</KyaLink>
            <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-4 text-[15px] font-[700] text-white disabled:opacity-50" style={{ background: K.forest }}>
              <Check className="size-4" /> {saving ? t("birdRecord.saving", "Saving…") : t("birdRecord.save", "Save")}
            </button>
          </div>
        ) : editable ? (
          <KyaLink onClick={openEdit}><Pencil className="size-4" /> {t("birdRecord.edit", "Edit")}</KyaLink>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-3 p-4">
          <BirdField label={t("birdRecord.species", "Species")}>
            <input className="kya-input" value={f.species} maxLength={80} onChange={(e) => setF((p) => ({ ...p, species: e.target.value }))} />
          </BirdField>
          {/* Age + Hatch date are coupled — AgePicker disables Age when a
              hatch date is set and derives age from it. */}
          <AgePicker
            layout="stacked"
            age={f.age}
            birthDate={f.birth_date}
            onChange={(next) => setF((p) => ({ ...p, age: next.age, birth_date: next.birthDate ?? "" }))}
          />
          <BirdField label={t("birdRecord.sex", "Sex")}>
            <select className="kya-input" value={f.sex} onChange={(e) => setF((p) => ({ ...p, sex: e.target.value }))}>
              <option value="">{t("birdRecord.notSet", "Not set")}</option>
              <option value="male">{t("birdRecord.male", "Male")}</option>
              <option value="female">{t("birdRecord.female", "Female")}</option>
              <option value="unknown">{t("birdRecord.unknown", "Unknown")}</option>
            </select>
          </BirdField>
          <BirdField label={t("birdRecord.flight", "Flight")}>
            <select className="kya-input" value={f.flight_status} onChange={(e) => setF((p) => ({ ...p, flight_status: e.target.value }))}>
              <option value="unknown">{t("birdRecord.unknown", "Unknown")}</option>
              <option value="fully_flighted">{t("birdRecord.fullyFlighted", "Fully flighted")}</option>
              <option value="clipped">{t("birdRecord.clipped", "Clipped")}</option>
              <option value="partially_clipped">{t("birdRecord.partiallyClipped", "Partially clipped")}</option>
            </select>
          </BirdField>
        </div>
      ) : (
        <dl className="m-0 pb-1">
          {rows.map(([label, value], i) => (
            <div key={label} className="flex min-h-[48px] items-center gap-3 px-4 py-2" style={{ borderBottom: i === rows.length - 1 ? undefined : `1px solid ${K.line}` }}>
              <dt className="w-[96px] shrink-0 text-[12.5px]" style={{ color: K.quiet }}>{label}</dt>
              <dd className="m-0 flex min-w-0 flex-1 items-center justify-between gap-2 text-[15px]">
                {value ? <span className="truncate font-[600]">{value}</span> : <span style={{ color: K.quiet }}>{t("birdRecord.notAdded", "Not added")}</span>}
                {!value && editable && <KyaLink onClick={openEdit}>{t("birdRecord.add", "Add")}</KyaLink>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </KyaCard>
  );
}
