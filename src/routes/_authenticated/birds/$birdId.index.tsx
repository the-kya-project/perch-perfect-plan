import { friendlyError } from "@/lib/errorMessage";
import { useTranslation, Trans } from "react-i18next";
import i18next, { type TFunction } from "i18next";
import { createFileRoute, Link, useNavigate, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { purgeBirdMedia } from "@/lib/birdMedia.functions";
import { birdMediaPurgeFailedText } from "@/lib/i18n/serverErrors";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { useBirdRole } from "@/lib/useBirdRole";
import { useActiveSitIdForBird } from "@/components/CaregiverHome";
import { useCapability } from "@/lib/useCapability";
import { weightTrendPill, computeWeightTrend } from "@/lib/weightTrend";
import { AgePicker } from "@/components/BirdPickers";
import { MemberContextBanner } from "@/components/MemberContextBanner";
import { PhotoCropper } from "@/components/PhotoCropper";
import { useServerFn } from "@tanstack/react-start";
import { getPendingHandoff, cancelHandoff, makePermanent } from "@/lib/handoff.functions";
import { IconTile, LimeStat, StatusPill, SectionHead, RecordRow, Card, PrimaryButton } from "@/components/system";
import { BirdPhotoSheet } from "@/components/BirdPhotoSheet";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { toast } from "sonner";
import {
  Feather, Scale, BookOpen, IdCard, CalendarHeart, ClipboardList,
  Plus, FileText, Activity, Pencil, ArrowLeft, ArrowRight, Camera,
  Check, X, Users, ArrowRightLeft, Heart, Loader2, Trash2, Crop, Flower2, HeartCrack,
} from "lucide-react";
import { formatLocalDate } from "@/lib/dates";

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
        .select("id, owner_id, name, species, age, sex, flight_status, birth_date, photo_url, photo_position, setup_complete, is_foster, became_permanent_on, intake_date")
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
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <BirdRecordHero birdId={birdId} />
        <main className="space-y-4 px-5 pt-[14px]">
          <MemberContextBanner birdId={birdId} />
          <BirdRecordBody birdId={birdId} />
        </main>
      </div>
    </div>
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
    <div className="grid min-h-screen place-items-center bg-[var(--cream)] px-8 pb-nav text-center">
      <div>
        <h1 className="t-h2 text-[var(--ink)]">{t("birdRecord.youReOffline", "You're offline")}</h1>
        <p className="t-body mx-auto mt-3 max-w-[28rem] text-[var(--mute2)]">
          {t("birdRecord.thisRecordNeedsAConnection", "This record needs a connection. Nothing has been lost — it'll be here when you're back.")}
        </p>
      </div>
    </div>
  );
}

/** Deliberately does not say whether the bird exists — only that it isn't yours. */
function BirdNoAccess() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--cream)] px-8 pb-nav text-center">
      <div>
        <h1 className="t-h2 text-[var(--ink)]">{t("birdRecord.thisRecordIsnTYours", "This record isn't yours anymore")}</h1>
        <p className="t-body mx-auto mt-3 max-w-[28rem] text-[var(--mute2)]">
          {t("birdRecord.youMayHaveHandedThis", "You may have handed this bird off, or your access may have been removed. If you think that's wrong, ask whoever looks after the record now.")}
        </p>
        <div className="mt-5">
          <PrimaryButton tone="ink" onPress={() => navigate({ to: "/dashboard" })}>
            {t("birdRecord.backToYourFlock", "Back to your flock")}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

// Contained hero card — the bird's photo lives inside a single rounded card
// with an ink gradient overlay holding the name + identity (matching the sitter
// view). Replaces the old full-bleed photo block, which clipped into the iOS
// status bar. (Solo Home embeds only BirdRecordBody, under its own greeting
// hero, so this isn't doubled.)
function BirdRecordHero({ birdId }: { birdId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  // Back always moves UP the hierarchy: the home screen, or Remembering when the
  // visitor came from a memorial card (explicit router state, set by the
  // Remembering row). NEVER history.back() here — facet pages (care plan,
  // weight, …) hardcode their back as a PUSH to this page, so popping history
  // from here would land back ON the facet and bounce forever.
  const fromRemembering = useLocation({ select: (l) => !!(l.state as any)?.fromRemembering });
  const goBack = () => navigate({ to: fromRemembering ? "/remembering" : "/dashboard" });
  const role = useBirdRole(birdId);
  const isOwner = role === "owner";
  const { data: bird } = useBirdRecord(birdId);
  const photoOf = useBirdPhotos([bird?.photo_url], 800);
  const photo = photoOf(bird?.photo_url);
  const name = bird?.name ?? t("birdRecord.thisBird", "This bird");
  const meta = [bird?.species || t("birdRecord.parrot", "Parrot"), bird?.age].filter(Boolean).join(" · ");
  const since = bird?.is_foster && bird?.intake_date ? t("birdRecord.withYouSince", "With you since {{date}}", { date: fmtMonthYear(bird.intake_date) }) : null;
  const identity = [meta, since].filter(Boolean).join(" · ");
  const [photoSheet, setPhotoSheet] = useState(false);

  return (
    <>
      {/* 16px gutters + status-bar-safe top padding so the card never clips. */}
      <div className="px-[16px] pt-[max(env(safe-area-inset-top),14px)]">
        <div className="relative h-[380px] w-full overflow-hidden rounded-[22px] bg-[#1a3d2e]">
          {photo?.url ? (
            <>
              <BirdPhotoCrop url={photo.url} original={photo.original} position={bird?.photo_position} alt={name} eager />
              {/* Ink gradient over the bottom 60% so the name stays readable on
                  any photo. */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[60%]"
                style={{ background: "linear-gradient(to top, rgba(26,61,46,0.96), transparent)" }}
              />
            </>
          ) : (
            // No photo: solid ink card with a muted parrot mark centered.
            <div className="absolute inset-0 grid place-items-center">
              <img src="/brand/parrot-lime.svg" alt="" aria-hidden className="w-20 opacity-25" />
            </div>
          )}

          {/* Floating controls over the photo. */}
          <div className="absolute inset-x-0 top-[14px] flex items-center justify-between px-[14px]">
            <HeroCircleBtn label={t("birdRecord.back", "Back")} onPress={goBack}>
              <ArrowLeft className="size-5" />
            </HeroCircleBtn>
            {isOwner && bird ? (
              <HeroCircleBtn label={t("birdRecord.editPhoto", "Edit photo")} onPress={() => setPhotoSheet(true)}>
                <Camera className="size-5" />
              </HeroCircleBtn>
            ) : (
              <span className="size-9" />
            )}
          </div>

          {/* Name + identity pinned to the bottom, over the gradient/ink. */}
          <div className="absolute inset-x-0 bottom-0 px-5 pb-5">
            {bird?.is_foster && <p className="t-eyebrow mb-1 text-[var(--teal)]">{t("birdRecord.inYourCare", "In your care")}</p>}
            <h1 className="text-[34px] font-[400] leading-[1.05] text-white">{name}.</h1>
            {identity && <p className="mt-1 text-[13.5px] text-white/85">{identity}</p>}
            <button
              type="button"
              onClick={() => navigate({ to: "/birds/$birdId/identity", params: { birdId } })}
              className="mt-2 inline-flex items-center gap-1 text-[14px] font-[500] text-[var(--lime)] active:opacity-80"
            >
              {t("birdRecord.viewIdentity", "View identity")} <ArrowRight className="size-4" />
            </button>
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

// Floating circular control over the hero photo: cream-tinted glass, ink icon.
function HeroCircleBtn({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onPress}
      className="grid size-9 place-items-center rounded-full text-[var(--ink)] backdrop-blur active:scale-95"
      style={{ background: "rgba(244,241,232,0.8)" }}
    >
      {children}
    </button>
  );
}

// The bird-record body without page chrome — reused as solo Home (with the
// global header + Today panel + Household row wrapped around it on /dashboard).
export function BirdRecordBody({ birdId }: { birdId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const role = useBirdRole(birdId);
  const isOwner = role === "owner";
  // Capability gates (mirror RLS): show write affordances members actually have.
  const canLogCare = useCapability("log_daily_care", { birdId });
  const canHealth = useCapability("record_health", { birdId });
  const canEditPlan = useCapability("edit_care_plans", { birdId });
  const canFlock = useCapability("manage_flock", { birdId });
  // Covering an active sit for this bird (household caregiver) — gates the
  // "something's wrong" entry on the SITUATION, not the account type.
  const activeSitId = useActiveSitIdForBird(birdId);

  const { data: bird } = useBirdRecord(birdId);

  const { data: weights } = useQuery({
    queryKey: ["bird-weights", birdId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("weight_entries")
        .select("id, grams, measured_at, source")
        .eq("bird_id", birdId)
        .order("measured_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; grams: number; measured_at: string; source: string }>;
    },
  });

  const { data: checkins } = useQuery({
    queryKey: ["bird-checkins", birdId],
    queryFn: async () => {
      // Widened for the health-summary block: 60 rows (was 15) reliably covers a
      // 30-day window at up to 2 checks/day, WITHOUT a date cutoff so the Recent
      // list below keeps showing a rarely-checked bird's older entries. Also
      // selects the per-item statuses + resolved_at so the summary can say WHICH
      // items came back not-normal and whether flags are still open.
      const { data, error } = await supabase
        .from("daily_logs")
        .select("id, log_date, triage_status, resolved_at, created_at, source, alertness_status, food_status, water_status, droppings_status, energy_status, breathing_status, posture_status, behavior_status, injury_status, exposure_status")
        .eq("bird_id", birdId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; log_date: string; triage_status: string; created_at: string } & Record<string, unknown>>;
    },
  });

  // Strip avatar is rendered at 64px (size-16); request 256px so it stays sharp
  // on retina/3x devices when scaled down from the bird's main photo source.
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
  const current = weights?.[0];
  // ONE trend computation, shared with the Home flock card (weightTrendPill):
  // latest entry vs the immediately previous one. The two pills are now
  // guaranteed identical.
  const wtPill = weightTrendPill(weights ?? []);

  // Merge weight entries + sitter check-ins into one newest-first feed.
  const recent = [
    ...(weights ?? []).map((w) => ({ kind: "weight" as const, at: w.measured_at, id: `w-${w.id}`, rawId: w.id, grams: w.grams, source: w.source as string | null })),
    ...(checkins ?? []).map((c: any) => ({ kind: "checkin" as const, at: c.created_at, id: `c-${c.id}`, rawId: c.id as string, status: c.triage_status, source: (c.source as string | null) ?? "sitter" })),
  ]
    .sort((a, b) => +new Date(b.at) - +new Date(a.at))
    .slice(0, 12);

  const name = bird?.name ?? t("birdRecord.thisBird", "This bird");
  const initial = (bird?.name?.slice(0, 1) ?? "?").toUpperCase();

  // Reframe-in-place: dragging the strip photo saves its crop position. Upload
  // of a new photo lives on the Identity facet, not here.
  async function savePhotoPosition(pos: string) {
    if (!bird) return;
    const { error } = await supabase.from("birds").update({ photo_position: pos } as any).eq("id", birdId);
    if (error) { toast.error(friendlyError(error)); return; }
    qc.invalidateQueries({ queryKey: ["bird-record", birdId] });
    qc.invalidateQueries({ queryKey: ["bird-identity", birdId] });
    qc.invalidateQueries({ queryKey: ["bird", birdId] });
    qc.invalidateQueries({ queryKey: ["birds"] });
  }

  return (
    <>
      {/* Fresh bird → guide straight into the care plan. Sits at the very top of
          the record (above the empty weight card) so creating a bird leads to an
          obvious next step instead of a hunt. Prominent but skippable. */}
      {bird && !bird.setup_complete && canEditPlan && (
        <section className="rounded-[18px] bg-white p-4 ring-1 ring-[var(--line2)]" style={{ boxShadow: "0 6px 14px -8px rgba(40,50,40,.08)" }}>
          <p className="t-section">{t("birdRecord.setUpCarePlan", "Set up {{name}}'s care plan", { name })}</p>
          <p className="t-body mt-1 text-[var(--ink2)]">
            {t("birdRecord.buildCarePlanIntro", "Build {{name}}'s care plan so sitters and household members know exactly what to do. You can skip and set it up later.", { name })}
          </p>
          <div className="mt-3">
            <PrimaryButton tone="lime" icon={<ClipboardList className="size-4" />} onPress={() => navigate({ to: "/birds/$birdId/setup", params: { birdId }, search: { step: 1 } })}>
              {t("birdRecord.createCarePlan", "Create care plan")}
            </PrimaryButton>
          </div>
        </section>
      )}

      {/* At-a-glance health summary — compilation only (describes what the data
          says over the last 30 days; no judgments). Owner + household member
          surface only; the sitter view has its own screens and is untouched.
          Renders nothing until data resolves and nothing for a data-less bird. */}
      <HealthSummary
        weights={weights}
        checkins={checkins}
        onOpenWeight={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })}
        onOpenScan={(scanId) => navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId, scanId } })}
      />

      {/* One-time "adjust crop" nudge for photos that have no focal point yet. */}
      {showFocalNudge && (
        <div className="flex items-center gap-3 rounded-[14px] p-3" style={{ background: "var(--amber-fill)", border: "1px solid var(--amber-line)" }}>
          <Crop className="size-5 shrink-0" style={{ color: "var(--amber-ink)" }} />
          <button type="button" onClick={() => setPhotoSheet(true)} className="min-w-0 flex-1 text-left">
            <span className="block text-[14px] font-[500]" style={{ color: "var(--amber-ink)" }}>{t("birdRecord.adjustCrop", "Adjust crop")}</span>
            <span className="block text-[12.5px]" style={{ color: "var(--amber-ink)" }}>{t("birdRecord.makeSureTheBirdS", "Make sure the bird's face is centered.")}</span>
          </button>
          <button type="button" onClick={dismissNudge} aria-label={t("birdRecord.dismiss", "Dismiss")} className="grid min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-full" style={{ color: "var(--amber-ink)" }}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Latest weight */}
      <LimeStat
        eyebrow={t("birdRecord.latestWeight", "Latest weight")}
        value={current ? <>{current.grams}<span className="text-[16px] font-[400] text-[var(--moss)]"> g</span></> : "—"}
        meta={current
          ? <><StatusPill tone={wtPill.tone}>{wtPill.label}</StatusPill><span className="t-meta">{t("birdRecord.lastWeighedOn", "last weighed {{date}}", { date: fmtDate(current.measured_at) })}</span></>
          : <span className="text-[13px] text-[var(--ink2)]">{t("birdRecord.noWeightYetLogThe", "No weight yet — log the first")}</span>}
        action={
          canLogCare ? (
            <button type="button" aria-label={t("birdRecord.logWeight", "Log weight")} onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId }, search: { log: true } })} className="grid size-11 place-items-center rounded-full bg-[var(--ink)] text-[var(--lime)] active:scale-95">
              <Plus className="size-5" />
            </button>
          ) : undefined
        }
      />

      {/* Welcome to the flock — foster-fail, near the top (not destructive, so
          it's kept out of the More group). */}
      {canFlock && bird?.is_foster && <HandoffSection birdId={birdId} name={name} part="welcome" />}

      {/* Basic info — Species / Age / Sex / Flight (owner-editable). */}
      {bird && <BasicInfoCard birdId={birdId} bird={bird} editable={canFlock} />}

      {/* Record list */}
      <section>
        <SectionHead title={t("birdRecord.recordHeading", "{{name}}'s record", { name })} />
        <Card>
          {bird?.setup_complete && (
            <RecordRow leading={<IconTile size={38} icon={<ClipboardList className="size-5" />} />} title={t("birdRecord.carePlan", "Care plan")} subtitle={t("birdRecord.foodRoutineBehaviorHomeHealth", "Food, routine, behavior, home, health")} onClick={() => navigate({ to: "/birds/$birdId/plan", params: { birdId } })} />
          )}
          <RecordRow leading={<IconTile size={38} icon={<Scale className="size-5" />} />} title={t("birdRecord.weight", "Weight")} subtitle={weightCount > 0 ? `${weightCount === 1 ? t("birdRecord.entryCount", "{{n}} entry", { n: weightCount }) : t("birdRecord.entriesCount", "{{n}} entries", { n: weightCount })} · ${wtPill.label.toLowerCase()}` : t("birdRecord.notStarted", "Not started")} onClick={() => navigate({ to: "/birds/$birdId/weight", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<BookOpen className="size-5" />} />} title={t("birdRecord.journal", "Journal")} subtitle={t("birdRecord.moltMedsVetVisits", "Molt, meds, vet visits")} onClick={() => navigate({ to: "/birds/$birdId/journal", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<IdCard className="size-5" />} />} title={t("birdRecord.identity", "Identity")} subtitle={t("birdRecord.chipBandHatchDateOrigin", "Chip, band, hatch date, origin, photo")} onClick={() => navigate({ to: "/birds/$birdId/identity", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<CalendarHeart className="size-5" />} />} title={t("birdRecord.moments", "Moments")} subtitle={t("birdRecord.markTheDaysWorthRemembering", "Mark the days worth remembering")} onClick={() => navigate({ to: "/birds/$birdId/moments", params: { birdId } })} />
          <RecordRow leading={<IconTile size={38} icon={<FileText className="size-5" />} />} title={t("birdRecord.vetSummary", "Vet summary")} subtitle={t("birdRecord.oneCleanSheetForThe", "One clean sheet for the vet")} onClick={() => navigate({ to: "/birds/$birdId/vet-summary", params: { birdId } })} />
          {canHealth && <RecordRow leading={<IconTile size={38} icon={<Activity className="size-5" />} />} title={t("birdRecord.runAHealthScan", "Run a health scan")} subtitle={t("birdRecord.theSameDailyCheckA", "The same daily check a sitter runs")} onClick={() => navigate({ to: "/birds/$birdId/scan", params: { birdId } })} last />}
        </Card>
      </section>

      {/* Recent — id anchors the health-summary block's checks tap-through. */}
      <section id="bird-recent">
        <SectionHead title={t("birdRecord.recent", "Recent")} />
        {recent.length === 0 ? (
          <div className="rounded-[16px] bg-[var(--cream2)] p-6 text-center text-[14px] text-[var(--mute)]">
            {t("birdRecord.nothingLoggedYetWeightsAnd", "Nothing logged yet. Weights and sitter check-ins will show up here.")}
          </div>
        ) : (
          <Card>
            {recent.map((r, i) => (
              <RecordRow
                key={r.id}
                leading={<IconTile size={34} tone="pale" icon={r.kind === "weight" ? <Scale className="size-4" /> : <Feather className="size-4" />} />}
                title={r.kind === "weight" ? t("birdRecord.weightLogged", "Weight logged — {{grams}} g", { grams: r.grams }) : t("birdRecord.dailyCheckIn", "Daily check-in — {{status}}", { status: checkinLabel(t, r.status) })}
                subtitle={fmtDate(r.at)}
                trailing={r.source === "household" ? <StatusPill tone="household">{t("birdRecord.household", "Household")}</StatusPill> : r.source === "sitter" ? <StatusPill tone="off">{t("birdRecord.sitter", "Sitter")}</StatusPill> : undefined}
                // Tap into the existing detail: a check-in opens its health-check
                // detail; a weight opens the weight history.
                onClick={r.kind === "checkin"
                  ? () => navigate({ to: "/birds/$birdId/scans/$scanId", params: { birdId, scanId: r.rawId } })
                  : () => navigate({ to: "/birds/$birdId/weight", params: { birdId } })}
                last={i === recent.length - 1}
              />
            ))}
          </Card>
        )}
      </section>

      {/* Sharing — owner only */}
      {isOwner && (
        <Card>
          <RecordRow leading={<IconTile size={38} tone="pale" icon={<Users className="size-5" />} />} title={t("birdRecord.whoCanSee", "Who can see {{name}}'s record", { name })} subtitle={t("birdRecord.householdSitters", "Household & sitters")} onClick={() => navigate({ to: "/birds/$birdId/access", params: { birdId } })} last />
        </Card>
      )}

      {/* More — the two major bird-status actions grouped together, low
          emphasis: hand off (record goes elsewhere) and delete (record is gone).
          For fosters the handoff reads a touch more prominent, above Delete. */}
      {canFlock && bird && (
        <section className="pt-1">
          <div className="border-t border-[var(--line2)] pt-4">
            <p className="t-eyebrow mb-2 px-0.5 text-[var(--teal-on-cream)]">{t("birdRecord.more", "More")}</p>
            <div className="space-y-2">
              <HandoffSection birdId={birdId} name={name} part="handoff" prominent={!!bird.is_foster} />
              {/* Mark as passed — quiet, owner-only. Opens the gentle confirm
                  flow; the record is preserved as a memorial, never deleted. */}
              {isOwner && (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/birds/$birdId/farewell", params: { birdId } })}
                  className="flex min-h-[48px] w-full items-center gap-3 rounded-[13px] bg-white px-4 text-left ring-1 ring-[var(--line2)] active:scale-[0.99]"
                >
                  <Flower2 className="size-4 shrink-0 text-[var(--mute2)]" />
                  <span className="text-[14px] font-[500] text-[var(--ink2)]">{t("birdRecord.markAsPassed", "Mark as passed")}</span>
                </button>
              )}
              <DeleteBirdButton birdId={birdId} name={name} />
            </div>
          </div>
        </section>
      )}

      {/* Something's wrong — for whoever is COVERING an active sit for this
          bird (household member in charge). Gated on the situation, not the
          account type: same signal the scan/journal/weight write paths use.
          Sitter-link accounts get the same entry on their own bird page.
          Hidden for the owner and for members not covering a sit. */}
      {activeSitId && !isOwner && bird && (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => navigate({ to: "/birds/$birdId/concern", params: { birdId } })}
            className="flex min-h-[52px] w-full items-center gap-3 rounded-[13px] border border-[var(--line)] bg-white px-4 text-left active:scale-[0.99]"
          >
            <HeartCrack className="size-5 shrink-0 text-[var(--mute2)]" />
            <span className="flex-1 text-[14px] font-[500] text-[var(--ink)]">{t("birdRecord.somethingsWrong", "Something's wrong with {{name}}", { name })}</span>
            <ArrowRight className="size-4 shrink-0 text-[var(--mute2)]" />
          </button>
          <p className="t-meta mt-1.5 px-1">{t("birdRecord.passedOrTrouble", "If {{name}} has passed or is in serious trouble", { name })}</p>
        </div>
      )}

      {/* Reposition the bird's photo (opened from the adjust-crop nudge). The
          camera on the hero opens its own sheet; on solo Home this is the entry. */}
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


// ---------------------------------------------------------------------------
// At-a-glance health summary (30 days) — COMPILATION ONLY. Describes what the
// data plainly says: weight trend (computeWeightTrend, the shared math), check
// count + which items came back not-normal, open (unresolved) flags, and
// recency. No medical judgment, no alerts, no normal-range comparison — that's
// a deliberate later layer. Computes entirely from the two queries this screen
// already mounts (["bird-weights"], ["bird-checkins"]); adds no fetches.
// ---------------------------------------------------------------------------

const SUMMARY_WINDOW_DAYS = 30;
// Short display nouns per health-check status column (the scan UI's full labels
// are sentence-length; these are the compact equivalents, same columns).
const ITEM_NOUNS: Record<string, string> = {
  alertness_status: "alertness", food_status: "food", water_status: "water",
  droppings_status: "droppings", energy_status: "energy", breathing_status: "breathing",
  posture_status: "posture", behavior_status: "behavior", injury_status: "injury",
  exposure_status: "exposure",
};

function itemNoun(t: TFunction, col: string): string {
  switch (col) {
    case "alertness_status": return t("birdRecord.item.alertness", "alertness");
    case "food_status": return t("birdRecord.item.food", "food");
    case "water_status": return t("birdRecord.item.water", "water");
    case "droppings_status": return t("birdRecord.item.droppings", "droppings");
    case "energy_status": return t("birdRecord.item.energy", "energy");
    case "breathing_status": return t("birdRecord.item.breathing", "breathing");
    case "posture_status": return t("birdRecord.item.posture", "posture");
    case "behavior_status": return t("birdRecord.item.behavior", "behavior");
    case "injury_status": return t("birdRecord.item.injury", "injury");
    case "exposure_status": return t("birdRecord.item.exposure", "exposure");
    default: return ITEM_NOUNS[col] ?? col;
  }
}

function daysAgoLabel(t: TFunction, iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return t("birdRecord.today", "today");
  if (days === 1) return t("birdRecord.yesterday", "yesterday");
  return t("birdRecord.daysAgo", "{{days}} days ago", { days });
}

export function HealthSummary({
  weights, checkins, onOpenWeight, onOpenScan,
}: {
  weights?: Array<{ grams: number; measured_at: string }>;
  checkins?: Array<{ id: string; log_date: string; triage_status: string; created_at: string } & Record<string, unknown>>;
  onOpenWeight: () => void;
  onOpenScan: (scanId: string) => void;
}) {
  const { t } = useTranslation();
  // Loading is "unknown", never "no data": render nothing until both resolve.
  if (!weights || !checkins) return null;
  if (weights.length === 0 && checkins.length === 0) return null;

  const cutoff = Date.now() - SUMMARY_WINDOW_DAYS * 86_400_000;

  // ---- weight line (shared trend math; window = 30 days) ----
  const weightsInWindow = weights.filter((w) => +new Date(w.measured_at) >= cutoff);
  const trend = computeWeightTrend(weights, SUMMARY_WINDOW_DAYS);
  let weightText: string | null = null;
  let weightPill: { label: string; tone: "good" | "attention" | "off" } | null = null;
  if (weightsInWindow.length >= 2) {
    const g = Math.round(Math.abs(trend.delta));
    if (trend.trend === "steady") { weightText = t("birdRecord.weightSteady", "Weight steady over the last {{days}} days", { days: SUMMARY_WINDOW_DAYS }); weightPill = { label: t("birdRecord.steady", "Steady"), tone: "good" }; }
    else if (trend.trend === "up") { weightText = t("birdRecord.weightUp", "Weight up {{g}} g over the last {{days}} days", { g, days: SUMMARY_WINDOW_DAYS }); weightPill = { label: t("birdRecord.upG", "Up {{g}} g", { g }), tone: "good" }; }
    else { weightText = t("birdRecord.weightDown", "Weight down {{g}} g over the last {{days}} days", { g, days: SUMMARY_WINDOW_DAYS }); weightPill = { label: t("birdRecord.downG", "Down {{g}} g", { g }), tone: "attention" }; }
  } else if (weights.length > 0) {
    // One (or zero) weigh-ins in the window: state the latest value, no trend.
    weightText = t("birdRecord.weighedG", "Weighed {{grams}} g", { grams: weights[0].grams });
    weightPill = { label: weightsInWindow.length ? t("birdRecord.oneWeighIn", "1 weigh-in") : t("birdRecord.noRecentWeights", "No recent weights"), tone: "off" };
  }

  // ---- checks line (count + which items came back not-normal) ----
  const checksInWindow = checkins.filter((c) => +new Date(c.created_at) >= cutoff);
  const itemCounts = new Map<string, number>();
  for (const c of checksInWindow) {
    for (const col of Object.keys(ITEM_NOUNS)) {
      const v = c[col];
      if (v === "not_sure" || v === "concerning") itemCounts.set(col, (itemCounts.get(col) ?? 0) + 1);
    }
  }
  const flaggedItems = [...itemCounts.entries()].sort((a, b) => b[1] - a[1]).map(([col]) => itemNoun(t, col));
  let checksText: string | null = null;
  let checksPill: { label: string; tone: "good" | "off" } | null = null;
  if (checksInWindow.length > 0) {
    const n = checksInWindow.length;
    const base = n === 1
      ? t("birdRecord.oneCheckInWindow", "{{n}} check in the last {{days}} days", { n, days: SUMMARY_WINDOW_DAYS })
      : t("birdRecord.checksInWindow", "{{n}} checks in the last {{days}} days", { n, days: SUMMARY_WINDOW_DAYS });
    if (flaggedItems.length === 0) {
      checksText = base;
      checksPill = { label: t("birdRecord.allNormal", "All normal"), tone: "good" };
    } else {
      const listed = flaggedItems.slice(0, 2).join(", ");
      const more = flaggedItems.length - 2;
      checksText = more > 0
        ? t("birdRecord.flaggedMore", "{{base}} · flagged {{listed}} +{{more}} more", { base, listed, more })
        : t("birdRecord.flagged", "{{base}} · flagged {{listed}}", { base, listed });
      checksPill = { label: t("birdRecord.nFlagged", "{{n}} flagged", { n: flaggedItems.length }), tone: "off" };
    }
  } else if (checkins.length > 0) {
    checksText = t("birdRecord.noChecksInWindow", "No checks in the last {{days}} days", { days: SUMMARY_WINDOW_DAYS });
    checksPill = { label: "—", tone: "off" };
  }

  // ---- open flags (red/yellow, unresolved, in window) — neutral wording ----
  const openFlags = checksInWindow.filter(
    (c) => (c.triage_status === "red" || c.triage_status === "yellow") && !c.resolved_at,
  );

  // ---- recency (quiet footer) ----
  const recencyBits: string[] = [];
  if (checkins.length > 0) recencyBits.push(t("birdRecord.lastChecked", "Last checked {{when}}", { when: daysAgoLabel(t, checkins[0].created_at) }));
  if (weights.length > 0) recencyBits.push(t("birdRecord.lastWeighed", "Last weighed {{when}}", { when: daysAgoLabel(t, weights[0].measured_at) }));

  const scrollToRecent = () => document.getElementById("bird-recent")?.scrollIntoView({ behavior: "smooth", block: "start" });

  const Row = ({ onClick, text, pill }: { onClick: () => void; text: string; pill: { label: string; tone: "good" | "attention" | "off" } }) => (
    <button type="button" onClick={onClick} className="flex min-h-[44px] w-full items-center gap-3 px-4 py-2 text-left active:bg-black/[0.03]">
      <span className="min-w-0 flex-1 text-[13.5px] font-[450] text-[var(--ink)]">{text}</span>
      <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
      <ArrowRight className="size-3.5 shrink-0 text-[var(--mute2)]" />
    </button>
  );

  return (
    <section className="overflow-hidden rounded-[18px] bg-white ring-1 ring-[var(--line2)]" style={{ boxShadow: "0 6px 14px -8px rgba(40,50,40,.08)" }}>
      <p className="t-eyebrow px-4 pt-3 text-[var(--teal-on-cream)]">{t("birdRecord.lately", "Lately")}</p>
      <div className="mt-1 divide-y divide-[var(--line2)]">
        {weightText && weightPill && (
          <Row text={weightText} pill={weightPill} onClick={onOpenWeight} />
        )}
        {checksText && checksPill && (
          <Row text={checksText} pill={checksPill} onClick={scrollToRecent} />
        )}
        {openFlags.length > 0 && (
          <Row
            text={openFlags.length === 1
              ? t("birdRecord.openFlagsOne", "{{n}} open flag", { n: openFlags.length })
              : t("birdRecord.openFlagsOther", "{{n}} open flags", { n: openFlags.length })}
            pill={{ label: t("birdRecord.view", "View"), tone: "off" }}
            onClick={() => onOpenScan(openFlags[0].id)}
          />
        )}
      </div>
      {recencyBits.length > 0 && <p className="t-meta px-4 pb-3 pt-2">{recencyBits.join(" · ")}</p>}
    </section>
  );
}

function checkinLabel(t: TFunction, status: string): string {
  return status === "red"
    ? t("birdRecord.concernFlagged", "concern flagged")
    : status === "yellow"
      ? t("birdRecord.somethingToCheck", "something to check")
      : t("birdRecord.allClear", "all clear");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return formatLocalDate(d, { month: "short", day: "numeric" });
}

function fmtMonthYear(iso: string): string {
  return formatLocalDate(new Date(`${iso.slice(0, 10)}T12:00:00`), { month: "short", year: "numeric" });
}

// Handoff + foster-fail actions, split by `part`:
//   "welcome"  → the foster-fail "Welcome to the flock" button (stays near the
//                top; it's not destructive, so it's separate from the More group).
//   "handoff"  → the pending-handoff banner, else a "Hand off [name]" button
//                (outline when prominent — fosters; quiet otherwise). Lives in
//                the bottom "More" group alongside Delete.
function HandoffSection({ birdId, name, part, prominent }: { birdId: string; name: string; part: "welcome" | "handoff"; prominent?: boolean }) {
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

  const outlineBtn = "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] bg-white text-[15px] font-[500] text-[var(--ink)] ring-1 ring-[var(--line)] active:scale-[0.99] disabled:opacity-50";

  if (part === "welcome") {
    return (
      <button
        type="button"
        disabled={permanentM.isPending}
        onClick={() => { if (window.confirm(t("birdRecord.makePermanentConfirm", "Make {{name}} a permanent member of your flock? You can change your mind later.", { name }))) permanentM.mutate(); }}
        className={outlineBtn}
      >
        <Heart className="size-4" /> {t("birdRecord.welcomeToFlock", "Welcome to the flock")}
      </button>
    );
  }

  // part === "handoff"
  if (pending?.pending) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] p-3" style={{ background: "var(--amber-fill)", border: "1px solid var(--amber-line)" }}>
        <Loader2 className="size-4 shrink-0 text-[var(--amber-ink)]" />
        <p className="min-w-0 flex-1 text-[12.5px] text-[var(--amber-ink)]">
          <Trans i18nKey="birdRecord.handoffPendingTo" defaults="Handoff pending — to <1>{{email}}</1>" values={{ email: pending.pending.email }} components={{ 1: <span className="font-[500]" /> }} />
        </p>
        <button type="button" disabled={cancelM.isPending} onClick={() => cancelM.mutate(pending.pending!.id)} className="shrink-0 text-[12.5px] font-[500] text-[var(--amber-ink)] underline disabled:opacity-50">
          {t("birdRecord.cancel", "Cancel")}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/birds/$birdId/handoff", params: { birdId } })}
      className={prominent ? outlineBtn : "flex min-h-[44px] w-full items-center justify-center gap-2 text-[14px] font-[500] text-[var(--mute)] active:scale-[0.99]"}
    >
      <ArrowRightLeft className="size-4" /> {t("birdRecord.handOff", "Hand off {{name}}", { name })}
    </button>
  );
}

// Quiet "Delete [name]" for the bottom More group — red text, expands to the
// type-the-name confirmation before the destructive cascade (same flow as the
// editor's Danger zone). No accidental taps: delete is gated on an exact match.
function DeleteBirdButton({ birdId, name }: { birdId: string; name: string }) {
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
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex min-h-[44px] w-full items-center justify-center gap-2 text-[14px] font-[500] text-[var(--red-ink)] active:scale-[0.99]"
      >
        <Trash2 className="size-4" /> {t("birdRecord.deleteName", "Delete {{name}}", { name })}
      </button>
      {confirming && (
        // Modal renders ABOVE the bottom nav (z-50 vs nav's z-40), backdrop
        // does NOT dismiss (destructive + irreversible — explicit choice only),
        // and the sheet is bottom-anchored with max-h-[100dvh]: on iOS Safari
        // the dynamic viewport shrinks when the keyboard appears so the action
        // buttons (sticky-bottom inside the modal) ride up with it instead of
        // disappearing behind the keyboard. The status-bar inset is also
        // honoured so the top of the modal isn't hidden under the notch.
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby="delete-bird-title">
          <div className="absolute inset-0 bg-[var(--ink)]/55" aria-hidden="true" />
          <div className="absolute inset-0 flex flex-col justify-end p-3">
            <div
              className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-[18px] bg-white shadow-xl"
              style={{ maxHeight: "calc(100dvh - max(env(safe-area-inset-top), 12px) - 1.5rem)" }}
            >
              <div className="overflow-y-auto p-5" style={{ background: "var(--red-fill)", borderBottom: "1px solid var(--red-line)" }}>
                <h2 id="delete-bird-title" className="t-section" style={{ color: "var(--red-deep)" }}>{t("birdRecord.deleteNameQ", "Delete {{name}}?", { name })}</h2>
                <p className="t-body mt-2" style={{ color: "var(--red-deep)" }}>
                  {t("birdRecord.deleteWarning", "Permanently delete {{name}} and everything in their record — care plan, weights, scans, journal, and photos. This can't be undone.", { name })}
                </p>
                <label htmlFor="delete-confirm" className="t-eyebrow mt-4 block" style={{ color: "var(--red-deep)" }}>{t("birdRecord.typeToConfirm", "Type {{name}} to confirm", { name })}</label>
                <input
                  id="delete-confirm"
                  className="input mt-1"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={name}
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                />
              </div>
              <div className="flex shrink-0 gap-2 bg-white p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => { setConfirming(false); setText(""); }}
                  className="min-h-[48px] flex-1 rounded-[12px] border border-[var(--line)] bg-white text-[15px] font-[500] text-[var(--ink)] disabled:opacity-50"
                >
                  {t("birdRecord.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  disabled={deleting || !ready}
                  onClick={del}
                  className="min-h-[48px] flex-1 rounded-[12px] text-[15px] font-[500] text-white disabled:opacity-50"
                  style={{ background: "var(--red-ink)" }}
                >
                  {deleting ? t("birdRecord.deleting", "Deleting…") : t("birdRecord.deleteName", "Delete {{name}}", { name })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const SEX_LABEL: Record<string, string> = { male: "Male", female: "Female", unknown: "Unknown" };
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
function BasicInfoCard({ birdId, bird, editable = true }: { birdId: string; bird: { species?: string | null; age?: string | null; sex?: string | null; flight_status?: string | null; birth_date?: string | null }; editable?: boolean }) {
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

  const speciesView = bird.species?.trim() || t("birdRecord.notSet", "Not set");
  const ageView = bird.age?.trim() || t("birdRecord.notSet", "Not set");
  // Setup saves "Male"/"Female"; SEX_LABEL keys are lowercase, so look up case-insensitively.
  const sexKey = (bird.sex ?? "").toLowerCase();
  const sexView = sexKey === "male" ? t("birdRecord.male", "Male") : sexKey === "female" ? t("birdRecord.female", "Female") : sexKey === "unknown" ? t("birdRecord.unknown", "Unknown") : (bird.sex || t("birdRecord.notSet", "Not set"));
  const flightKey = bird.flight_status ?? "unknown";
  const flightView =
    flightKey === "fully_flighted" ? t("birdRecord.fullyFlighted", "Fully flighted")
    : flightKey === "clipped" ? t("birdRecord.clipped", "Clipped")
    : flightKey === "partially_clipped" ? t("birdRecord.partiallyClipped", "Partially clipped")
    : FLIGHT_LABEL[flightKey] && flightKey !== "unknown" ? FLIGHT_LABEL[flightKey]
    : t("birdRecord.unknown", "Unknown");
  const hatchView = bird.birth_date
    ? formatLocalDate(new Date(bird.birth_date), { month: "short", day: "numeric", year: "numeric" })
    : t("birdRecord.notSet", "Not set");

  return (
    <section className="overflow-hidden rounded-[16px] bg-white ring-1 ring-[#e3dcc9]">
      <div className="flex items-center justify-between gap-3 border-b border-[#ece6d6] px-4 py-3">
        <h3 className="t-eyebrow text-[var(--teal-on-cream)]">{t("birdRecord.basicInfo", "Basic info")}</h3>
        {editing ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setEditing(false)} disabled={saving} className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[#5f5e5a]">
              <X className="size-3.5" /> {t("birdRecord.cancel", "Cancel")}
            </button>
            <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-[36px] items-center gap-1 rounded-full bg-[#1a3d2e] px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
              <Check className="size-3.5" /> {saving ? t("birdRecord.saving", "Saving…") : t("birdRecord.save", "Save")}
            </button>
          </div>
        ) : editable ? (
          <button type="button" onClick={openEdit} className="inline-flex min-h-[36px] items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-[#1a3d2e]">
            <Pencil className="size-3.5" /> {t("birdRecord.edit", "Edit")}
          </button>
        ) : null}
      </div>

      {editing ? (
        <div className="space-y-3 p-4">
          <BasicField label={t("birdRecord.species", "Species")}>
            <input className="input" value={f.species} maxLength={80} onChange={(e) => setF((p) => ({ ...p, species: e.target.value }))} />
          </BasicField>
          {/* Age + Hatch date are coupled — AgePicker disables Age when a
              hatch date is set and derives age from it. Stacked so each gets
              its own line (the wizard uses the default grid layout). */}
          <AgePicker
            layout="stacked"
            age={f.age}
            birthDate={f.birth_date}
            onChange={(next) => setF((p) => ({ ...p, age: next.age, birth_date: next.birthDate ?? "" }))}
          />
          <BasicField label={t("birdRecord.sex", "Sex")}>
            <select className="input" value={f.sex} onChange={(e) => setF((p) => ({ ...p, sex: e.target.value }))}>
              <option value="">{t("birdRecord.notSet", "Not set")}</option>
              <option value="male">{t("birdRecord.male", "Male")}</option>
              <option value="female">{t("birdRecord.female", "Female")}</option>
              <option value="unknown">{t("birdRecord.unknown", "Unknown")}</option>
            </select>
          </BasicField>
          <BasicField label={t("birdRecord.flight", "Flight")}>
            <select className="input" value={f.flight_status} onChange={(e) => setF((p) => ({ ...p, flight_status: e.target.value }))}>
              <option value="unknown">{t("birdRecord.unknown", "Unknown")}</option>
              <option value="fully_flighted">{t("birdRecord.fullyFlighted", "Fully flighted")}</option>
              <option value="clipped">{t("birdRecord.clipped", "Clipped")}</option>
              <option value="partially_clipped">{t("birdRecord.partiallyClipped", "Partially clipped")}</option>
            </select>
          </BasicField>
        </div>
      ) : (
        <dl>
          <BasicRow label={t("birdRecord.species", "Species")} value={speciesView} />
          <BasicRow label={t("birdRecord.age", "Age")} value={ageView} />
          <BasicRow label={t("birdRecord.hatchDate", "Hatch date")} value={hatchView} />
          <BasicRow label={t("birdRecord.sex", "Sex")} value={sexView} />
          <BasicRow label={t("birdRecord.flight", "Flight")} value={flightView} last />
        </dl>
      )}
    </section>
  );
}

function BasicRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 px-4 py-3 ${last ? "" : "border-b border-[#ece6d6]"}`}>
      <dt className="text-sm text-[#5f5e5a]">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-medium text-[#1a3d2e]">{value}</dd>
    </div>
  );
}

function BasicField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="t-eyebrow mb-1 block text-[var(--mute2)]">{label}</span>
      {children}
    </label>
  );
}
