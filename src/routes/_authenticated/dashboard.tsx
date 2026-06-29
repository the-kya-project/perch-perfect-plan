import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import type { SignedPhoto } from "@/lib/birdPhoto";
import {
  Plus, Settings, Users, ChevronRight, Scale, CalendarHeart, Calendar,
  Feather, AlertCircle, AlertTriangle,
} from "lucide-react";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";
import { AppOnboarding } from "@/components/AppOnboarding";
import { useTourDemo, DEMO_FLOCK, DEMO_FOSTERS, DEMO_HOUSEHOLD, demoGlanceFor, getDemoToday } from "@/lib/tourDemo";
import { deriveConcernByBird, daysAgo } from "@/lib/scanConcern";
import { Disclaimer } from "@/components/Disclaimer";
import { AddToHomeScreenPrompt } from "@/components/AddToHomeScreenPrompt";
import { BirdPhotoCrop } from "@/components/BirdPhotoCrop";
import { toast } from "sonner";
import { ASPCA_POISON_CONTROL, isPhoneField, phoneWarning, formatPhoneOnBlur } from "@/lib/emergency";
import { isAddressField } from "@/lib/address";
import { AddressInput } from "@/components/AddressInput";
import { fetchScanFeed, getNotifSeenAt } from "@/lib/notificationsFeed";
import { InkHero, IconTile, StatusPill, SectionHead, CtaLink, type HeroCta } from "@/components/system";
import { CaregiverHome, useActiveCaregiver } from "@/components/CaregiverHome";
import { BirdRecordBody } from "./birds/$birdId.index";
import { getDashboardHome, getHouseholdHome, resolveOwnerNames, type HomeHousehold } from "@/lib/home.functions";
import { useMyPermissions } from "@/lib/useCapability";
import { PRESET_LABELS, presetForCapabilities } from "@/lib/capabilities";
import { getPastBirds } from "@/lib/handoff.functions";
import {
  groupWeights, weightGlance, upcomingMoments, buildTodayItems, buildHomeStateCopy, daysSince,
  type HomeBird, type WeightEntry, type TodayItem, type WeightGlance, type UpcomingSit,
} from "@/lib/homeData";

const dashboardSearch = z.object({
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
  // Deep-link from a bird's Emergency tab / Account → open account defaults.
  emergencyDefaults: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Home — Kya & Co." }] }),
  validateSearch: dashboardSearch,
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { emergencyDefaults } = Route.useSearch();

  // ABOVE-THE-FOLD: one consolidated round trip (profile name + flock + weights
  // + sits, with caregiver names resolved server-side). refetchOnMount mirrors
  // the old per-query behavior so a bird added/handed-off elsewhere flips
  // solo↔flock on return, and a logged weight refreshes the pills.
  const dashFn = useServerFn(getDashboardHome);
  const { data: home, isLoading: birdsLoading } = useQuery({
    queryKey: ["dashboard-home"],
    refetchOnMount: "always",
    queryFn: () => dashFn(),
  });
  const firstName = (home?.profile?.displayName ?? "").trim().split(/\s+/)[0] || "";
  // Stable references per `home` so the derived useMemos don't recompute every render.
  const birds = useMemo(() => (home?.birds ?? []) as any[], [home]);
  const allWeights = useMemo(() => (home?.weights ?? []) as WeightEntry[], [home]);
  const sits = useMemo(() => (home?.sits ?? []) as any[], [home]);

  // Bell badge — unread scans. Shared ["scan-feed"] query (also powers the
  // header bell), so this is a single deduped request, not a dashboard-only one.
  const { data: scanFeed = [] } = useQuery({ queryKey: ["scan-feed"], queryFn: fetchScanFeed });
  const [notifSeenAt] = useState(() => getNotifSeenAt());
  const unreadNotifs = scanFeed.filter((n) => new Date(n.created_at).getTime() > notifSeenAt).length;

  const birdIds = useMemo(() => birds.map((b) => b.id), [birds]);
  // 800px (not 256) so the flock-card crop is byte-for-byte the same image the
  // reposition "Flock card" preview and the bird-record hero use. Signed URLs
  // are batched + cached by useBirdPhotos; this is the one media call.
  const resolvePhoto = useBirdPhotos(birds.map((b) => b.photo_url), 800);

  // SECONDARY panels (full household roster + activity, past-birds footer) are
  // deferred until after first paint — they don't block the above-the-fold load.
  // Slow-changing, so they carry a longer staleTime.
  const [showSecondary, setShowSecondary] = useState(false);
  useEffect(() => { setShowSecondary(true); }, []);
  const householdFn = useServerFn(getHouseholdHome);
  const { data: household } = useQuery({ queryKey: ["home-household"], enabled: showSecondary, staleTime: 5 * 60_000, queryFn: () => householdFn() });
  const pastBirdsFn = useServerFn(getPastBirds);
  const { data: pastBirds } = useQuery({ queryKey: ["past-birds"], enabled: showSecondary, staleTime: 5 * 60_000, queryFn: () => pastBirdsFn() });
  const pastCount = pastBirds?.birds?.length ?? 0;

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

  // Both-roles context: split the flock into birds the user OWNS vs birds they
  // help with as a household MEMBER (owner_id !== me). getDashboardHome returns
  // both sets (RLS-scoped) each carrying owner_id; we only group when BOTH
  // contexts exist, so single-context users see a plain flock (no headers).
  const { data: perms } = useMyPermissions();
  const myId = perms?.myId ?? null;
  const ownedBirds = useMemo(() => (myId ? homeBirds.filter((b) => (b as any).owner_id === myId) : homeBirds), [homeBirds, myId]);
  const memberBirds = useMemo(() => (myId ? homeBirds.filter((b) => (b as any).owner_id !== myId) : []), [homeBirds, myId]);
  const hasGrouping = !demo && ownedBirds.length > 0 && memberBirds.length > 0;

  // Resolve owner display names for the helped-with households (members can't
  // read owner profiles — RLS self-only — so this goes through the server fn).
  const memberOwnerIds = useMemo(() => [...new Set(memberBirds.map((b: any) => b.owner_id as string))], [memberBirds]);
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
    return [...m.entries()].map(([ownerId, birds]) => {
      const caps = perms?.byOwner.get(ownerId);
      const preset = perms?.presetByOwner.get(ownerId) ?? (caps ? presetForCapabilities([...caps]) : null);
      return {
        ownerId,
        birds,
        ownerName: ownerNames?.[ownerId] ?? null,
        chip: preset ? PRESET_LABELS[preset] : null,
      };
    });
  }, [memberBirds, perms, ownerNames]);

  // Fosters are an owner concept; member birds (even if the owner fosters them)
  // stay in the helped-with groups, never under "In your care".
  const fosterBirds = demo ? DEMO_FOSTERS : ownedBirds.filter((b) => b.is_foster);
  // Non-grouped path keeps the original single "Your flock" list (all non-foster
  // birds). Grouped path uses ownedFlock + memberGroups instead.
  const flockBirds = demo ? DEMO_FLOCK : (hasGrouping ? ownedBirds : homeBirds).filter((b) => !b.is_foster);
  const todayItemsView = demo ? getDemoToday() : todayItems;
  const householdView = demo ? DEMO_HOUSEHOLD : household;
  const glanceFor = (b: HomeBird) => (demo ? demoGlanceFor(b.id) : weightGlance(weightsByBird.get(b.id) ?? [], b.is_foster));
  const photoFor = (b: HomeBird) => (demo ? null : resolvePhoto(b.photo_url));

  const { data: caregiver } = useActiveCaregiver();
  const caregiverActive = !!caregiver?.sits?.length;

  // Home body line — state-aware (stale weigh-in → sit imminent → celebration
  // → new bird → weekend → default). Caregiver names are resolved server-side in
  // getDashboardHome (so the hero line doesn't wait on the lazy household load);
  // sitter names come from the row.
  const sitsForStateCopy = useMemo(
    () => (sits as any[]).map((s) => ({
      sitterName: s.sitter_name as string | null,
      caregiverName: (s.caregiverName as string | null) ?? null,
      startDate: s.start_date as string,
      daysUntil: -daysSince(s.start_date),
    })),
    [sits],
  );
  const stateCopy = birdsLoading ? undefined
    : birds.length === 0 ? "Add your first bird to start their record."
    : buildHomeStateCopy(homeBirds, weightsByBird, sitsForStateCopy, moments);
  const heroCta: HeroCta | undefined =
    !birdsLoading && birds.length === 0
      ? { label: "Add a bird", tone: "lime", icon: <Plus className="size-4" />, onPress: () => navigate({ to: "/birds/new" }) }
      : undefined;

  // Active-caregiver shift: when the signed-in user is the assigned caregiver
  // on a sit covering today, Home takes over the active-caregiver experience
  // (hero + Today's check + Birds you're covering). The normal Home returns
  // automatically when end_date < today (the hook's query no longer matches).
  if (!demo && caregiverActive && caregiver?.sits?.length) {
    return (
      <div className="min-h-screen bg-[var(--cream)] pb-nav">
        <div className="mx-auto max-w-md">
          <CaregiverHome data={caregiver} />
        </div>
        {/* Keep the tour mountable here so the "?" replay can flip demo mode on,
            which then drops back into the normal demo Home via the guard above.
            AppOnboarding picks the owner vs member flow by role. */}
        <AppOnboarding />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
      <HomeHeader firstName={firstName} unreadNotifs={unreadNotifs} stateCopy={stateCopy} cta={heroCta} />

      <main className="space-y-6 px-5 pb-6 pt-5">
        {emergencyDefaults && <DefaultsPanel />}

        {birdsLoading && !demo ? (
          <HomeSkeleton />
        ) : !demo && birds.length === 0 ? (
          <EmptyHome />
        ) : !demo && birds.length === 1 ? (
          <>
            <TodayPanel items={todayItemsView} onNavigate={onTodayNavigate} />
            <div className="space-y-4"><BirdRecordBody birdId={birds[0].id} /></div>
            <HouseholdActivity household={householdView} />
            <HouseholdRow household={householdView} firstName={firstName} />
            <FosterFooter count={pastCount} />
          </>
        ) : (
          <>
            <TodayPanel items={todayItemsView} onNavigate={onTodayNavigate} />

            <section className="space-y-3" data-coach="owner-flock">
              <SectionHeaderCTA title={hasGrouping ? "Your birds" : "Your flock"} ctaLabel="Add a bird" onCta={() => navigate({ to: "/birds/new" })} />
              {flockBirds.length === 0 ? (
                <p className="px-1 text-sm text-[#5b6b61]">No birds yet — start with your first.</p>
              ) : (
                <div className="space-y-3">
                  {flockBirds.map((b) => (
                    <BirdRow key={b.id} bird={b} photo={photoFor(b)} glance={glanceFor(b)} concern={concernByBird.has(b.id)} />
                  ))}
                </div>
              )}
            </section>

            {/* Birds you help with, one section per household (both-roles only). */}
            {hasGrouping && memberGroups.map((g) => (
              <section key={g.ownerId} className="space-y-3">
                <div className="px-1">
                  <h2 className="t-section">{g.ownerName ? `${possessive(g.ownerName)} household` : "A household you help with"}</h2>
                  <p className="t-meta text-[var(--teal-on-cream)]">You help here</p>
                </div>
                <div className="space-y-3">
                  {g.birds.map((b) => (
                    <BirdRow key={b.id} bird={b} photo={photoFor(b)} glance={glanceFor(b)} concern={concernByBird.has(b.id)} chip={g.chip ?? undefined} />
                  ))}
                </div>
              </section>
            ))}

            {fosterBirds.length > 0 && (
              <section className="space-y-3" data-coach="owner-fosters">
                <SectionHeaderCTA
                  title="In your care"
                  pill={`${fosterBirds.length} ${fosterBirds.length === 1 ? "foster" : "fosters"}`}
                  ctaLabel="Take in a bird"
                  onCta={() => navigate({ to: "/birds/new", search: { foster: true } as any })}
                />
                <div className="space-y-3">
                  {fosterBirds.map((b) => (
                    <BirdRow key={b.id} bird={b} photo={photoFor(b)} glance={glanceFor(b)} foster concern={concernByBird.has(b.id)} />
                  ))}
                </div>
              </section>
            )}

            <HouseholdActivity household={householdView} />
            <HouseholdRow household={householdView} firstName={firstName} />
            <FosterFooter count={pastCount} />
          </>
        )}

        <Disclaimer compact />
        <AddToHomeScreenPrompt />
      </main>
      </div>

      <AppOnboarding />
      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function HomeHeader({ firstName, unreadNotifs, stateCopy, cta }: { firstName: string; unreadNotifs: number; stateCopy?: string; cta?: HeroCta }) {
  const h = new Date().getHours();
  // Greetings are spoken-to-the-user copy: no terminal period.
  const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const greeting = firstName ? `${part}, ${firstName}` : part;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <InkHero
      showBrand
      eyebrow={dateLabel}
      headline={greeting}
      body={stateCopy}
      cta={cta}
      trailingIcons={<OwnerHeaderIcons />}
    />
  );
}

// ---------------------------------------------------------------------------
// Section header with a text-link CTA — SectionHead + CtaLink from the system.
// ---------------------------------------------------------------------------
function SectionHeaderCTA({ title, pill, ctaLabel, onCta }: { title: string; pill?: string; ctaLabel: string; onCta: () => void }) {
  return (
    <SectionHead
      title={pill ? <span className="inline-flex items-center gap-2">{title}<StatusPill tone="good">{pill}</StatusPill></span> : title}
      trailing={<CtaLink label={ctaLabel} icon={<Plus className="size-3.5" strokeWidth={2.2} />} onPress={onCta} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Today panel (adaptive — hidden entirely when empty)
// ---------------------------------------------------------------------------
function TodayPanel({ items, onNavigate }: { items: TodayItem[]; onNavigate: (i: TodayItem) => void }) {
  if (items.length === 0) return null;
  return (
    <section
      data-coach="owner-today"
      className="overflow-hidden rounded-[18px] border border-[#dccfa8]"
      style={{ background: "linear-gradient(180deg,#efe9da,#e7e0c8)" }}
    >
      <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3.5">
        <h2 className="t-section">Today</h2>
        <span className="t-eyebrow text-[var(--teal-on-cream)]">{items.length} {items.length === 1 ? "thing" : "things"}</span>
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.id} className="border-t border-[var(--line)]/70 first:border-t-0">
            <button type="button" onClick={() => onNavigate(it)} className="flex min-h-[44px] w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]">
              <IconTile
                size={34}
                tone={it.tone === "amber" ? "amber" : "ink-lime"}
                icon={it.to.kind === "scan" ? <AlertTriangle className="size-4" /> : it.tone === "amber" ? <AlertCircle className="size-4" /> : it.to.kind === "sits" ? <Calendar className="size-4" /> : <CalendarHeart className="size-4" />}
              />
              <span className="min-w-0 flex-1">
                <span className="t-item block truncate">{it.title}</span>
                <span className="t-meta block truncate">{it.meta}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-[var(--mute2)]" />
            </button>
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

function PhotoTile({ photo, name, species, position }: { photo: SignedPhoto | null; name: string; species: string | null; position?: string | null }) {
  const initial = (name?.slice(0, 1) ?? "?").toUpperCase();
  return (
    <div className="relative h-[80px] w-[72px] shrink-0 overflow-hidden rounded-[14px]" style={{ background: gradientFor(species || name) }}>
      {photo ? (
        <BirdPhotoCrop url={photo.url} original={photo.original} position={position} alt={name} />
      ) : (
        <div className="grid size-full place-items-center">
          <span className="text-2xl font-[500] text-white/90">{initial}</span>
        </div>
      )}
    </div>
  );
}

function GlancePill({ glance }: { glance: WeightGlance }) {
  if (glance.state === "none") return <span className="t-meta">No weights yet</span>;
  const pill = glance.pill;
  return (
    <span className="inline-flex items-center gap-1.5 text-[15px] text-[var(--ink)]">
      {glance.current}<span className="t-meta">g</span>
      <StatusPill tone={pill.tone}>{pill.label}</StatusPill>
    </span>
  );
}

function ConcernPill() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--amber-fill)] px-2 py-0.5 text-[11px] font-[500] text-[var(--amber-ink)]">
      <AlertTriangle className="size-3" /> Concern flagged
    </span>
  );
}

function BirdRow({ bird, photo, glance, foster, concern, chip }: { bird: HomeBird; photo: SignedPhoto | null; glance: WeightGlance; foster?: boolean; concern?: boolean; chip?: string }) {
  const fosterStatus = foster
    ? glance.state === "stale"
      ? { tone: "attention" as const, label: "Needs a weigh-in" }
      : { tone: "good" as const, label: "All good" }
    : null;
  return (
    <Link
      to="/birds/$birdId" params={{ birdId: bird.id }}
      className="flex items-center gap-3 rounded-[18px] bg-white p-3 ring-1 ring-[var(--line2)] active:scale-[0.995]"
      style={{ boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" }}
    >
      <PhotoTile photo={photo} name={bird.name} species={bird.species} position={bird.photo_position} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="t-item truncate text-[17px]">{bird.name}</h3>
          {foster && <StatusPill tone="good">Foster</StatusPill>}
          {chip && <StatusPill tone="household">{chip}</StatusPill>}
        </div>
        <p className="t-meta truncate">{bird.species || "Parrot"}</p>
        {foster && bird.intake_date && (
          <p className="t-meta">With you since {fmtShort(bird.intake_date)}</p>
        )}
        {/* One status at a time. An active concern is mutually exclusive with
            the normal status — show ONLY the concern pill (never alongside
            "All good" or the weight pill, which would contradict it). */}
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {concern ? (
            <ConcernPill />
          ) : fosterStatus ? (
            <span className={`text-[13px] font-[500] ${fosterStatus.tone === "good" ? "text-[var(--moss)]" : "text-[var(--amber-ink)]"}`}>{fosterStatus.label}</span>
          ) : (
            <GlancePill glance={glance} />
          )}
        </div>
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// From your household (activity, last 48h)
// ---------------------------------------------------------------------------
function HouseholdActivity({ household }: { household?: HomeHousehold }) {
  const activity = household?.activity ?? [];
  if (!household || household.members.length === 0 || activity.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHead title="From your household" />
      <ul className="space-y-1.5">
        {activity.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5 rounded-[14px] bg-white px-3 py-2.5 ring-1 ring-[var(--line2)]">
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: "var(--house)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-[var(--ink)]"><span className="font-[500]">{a.actorName}</span> {a.summary} for {a.birdName}</p>
              <p className="t-meta">{fmtAgo(a.at)}</p>
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
  const members = household?.members ?? [];
  const youInitial = (firstName.slice(0, 1) || "Y").toUpperCase();
  const hasMembers = members.length > 0;

  const primary = (() => {
    if (!hasMembers) return "Household";
    const names = members.map((m) => m.name?.trim()).filter(Boolean) as string[];
    if (names.length === 1) return `Household · You and ${names[0]}`;
    if (names.length === 2) return `Household · You, ${names[0]}, and ${names[1]}`;
    return `Household · You and ${members.length} others`;
  })();
  const secondary = !hasMembers
    ? "Add someone who helps care for your birds"
    : household?.scope === "all" || !household?.sharedBirdNames.length
      ? "Sharing all your birds"
      : `Sharing ${joinNames(household.sharedBirdNames)}`;

  const inner = (
    <div className={`flex items-center gap-3 ${hasMembers ? "" : "opacity-[0.55]"}`}>
      {hasMembers ? (
        <div className="flex shrink-0 -space-x-2">
          <Avatar initial={youInitial} />
          {members.slice(0, 2).map((m, i) => <Avatar key={m.userId} initial={(m.name?.slice(0, 1) || "?").toUpperCase()} dim={i === 1 && members.length > 2} />)}
        </div>
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--cream2)] text-[var(--mute2)]"><Users className="size-[18px]" /></span>
      )}
      <div className="min-w-0 flex-1">
        <p className="t-item truncate">{primary}</p>
        <p className="t-meta truncate">{secondary}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-[var(--mute2)]" />
    </div>
  );

  return (
    <Link to="/household" data-coach="owner-household" className="block px-1 active:opacity-80">{inner}</Link>
  );
}
function Avatar({ initial, dim }: { initial: string; dim?: boolean }) {
  return (
    <span className={`grid size-9 place-items-center rounded-full text-[11px] font-[500] text-white ring-2 ring-[var(--cream)] ${dim ? "bg-[var(--mute2)]" : "bg-[var(--moss)]"}`}>
      {initial}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Foster footer
// ---------------------------------------------------------------------------
function FosterFooter({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <p className="text-center text-[13px] italic text-[var(--mute2)]">
      You've helped {count} {count === 1 ? "bird" : "birds"} find a home.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Empty + skeleton — the InkHero already carries the "Add a bird" lime primary,
// so this is a calm explanatory card, no competing button.
// ---------------------------------------------------------------------------
function EmptyHome() {
  return (
    <section className="rounded-[18px] bg-white p-8 text-center ring-1 ring-[var(--line2)]" style={{ boxShadow: "0 6px 14px -8px rgba(40,50,40,.08)" }}>
      <div className="flex justify-center"><IconTile size={48} icon={<Feather className="size-6" />} /></div>
      <h2 className="t-section mt-3">Welcome to your flock</h2>
      <p className="t-body mx-auto mt-1.5 max-w-[34ch] text-[var(--ink2)]">Start their living record — care plan, weight, moments, and more. Tap Add a bird above to begin.</p>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-[18px] bg-white p-3 ring-1 ring-[var(--line2)]">
          <div className="h-[80px] w-[72px] shrink-0 animate-pulse rounded-[14px] bg-[var(--cream2)]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-[var(--cream2)]" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-[var(--cream2)]" />
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
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function fmtAgo(iso: string): string {
  const mins = Math.max(1, Math.round((Date.now() - +new Date(iso)) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? "hour" : "hours"} ago`;
  return "yesterday";
}
/** "Sarah" -> "Sarah's", "Chris" -> "Chris'". */
function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}
function joinNames(names: string[]): string {
  const n = names.filter(Boolean);
  if (n.length === 0) return "your birds";
  if (n.length === 1) return n[0];
  if (n.length === 2) return `${n[0]} and ${n[1]}`;
  return `${n.slice(0, -1).join(", ")}, and ${n[n.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Account emergency defaults — deep-link target only (Account / Emergency tab
// link to /dashboard?emergencyDefaults=true). Kept here so those links keep
// working without cluttering the redesigned Home.
// ---------------------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-[#5f5e5a]">{label}</span>
      {children}
    </label>
  );
}

function DefaultsPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const { data: defaults } = useQuery({
    queryKey: ["owner-defaults"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase.from("owner_emergency_defaults").select("*").eq("owner_id", u.user.id).maybeSingle();
      return data ?? { owner_id: u.user.id };
    },
  });
  const seedDefaults = (base: any) => {
    const v = { ...(base ?? {}) };
    if (!(typeof v.poison_control === "string" && v.poison_control.trim())) v.poison_control = ASPCA_POISON_CONTROL;
    return v;
  };
  const [d, setD] = useState<any>(() => seedDefaults(defaults));
  const [saving, setSaving] = useState(false);
  const fields: [string, string, boolean?][] = [
    ["owner_phone", "Owner phone", true],
    ["backup_name", "Backup contact name"],
    ["backup_phone", "Backup contact phone"],
    ["avian_vet_name", "Avian vet name"],
    ["avian_vet_phone", "Avian vet phone", true],
    ["avian_vet_address", "Avian vet address"],
    ["emergency_vet_name", "Emergency vet name"],
    ["emergency_vet_phone", "Emergency vet phone"],
    ["emergency_vet_address", "Emergency vet address"],
    ["poison_control", "Poison control number"],
    ["carrier_location", "Carrier location"],
    ["first_aid_kit_location", "First-aid kit location"],
    ["spending_limit", "Approved spending limit"],
  ];
  const filledCount = defaults
    ? fields.filter(([k]) => typeof (defaults as any)[k] === "string" && (defaults as any)[k].trim()).length
    : 0;

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || defaults === undefined) return;
    seededRef.current = true;
    setD(seedDefaults(defaults));
    setOpen(true);
    setTimeout(() => sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [defaults]);

  async function save() {
    setSaving(true);
    const { data: u } = await getLocalUser();
    if (!u.user) { toast.error("Signed out."); setSaving(false); return; }
    const row: Record<string, any> = { owner_id: u.user.id };
    for (const [k] of fields) {
      const v = d[k];
      row[k] = typeof v === "string" && v.trim() === "" ? null : v ?? null;
    }
    const { error } = await supabase.from("owner_emergency_defaults").upsert(row, { onConflict: "owner_id" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved. Every bird uses this account info unless you edit it for that bird.");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["owner-defaults"] });
  }

  return (
    <section ref={sectionRef} id="emergency-defaults" className="scroll-mt-4 space-y-3">
      <div className="flex items-end justify-between">
        <h2 className="t-section">Account emergency defaults</h2>
        <button type="button" onClick={() => { setD(seedDefaults(defaults)); setOpen((o) => !o); }} className="text-sm font-medium text-[#1a3d2e] underline">
          {open ? "Close" : filledCount > 0 ? "Edit" : "Set up"}
        </button>
      </div>
      <p className="text-xs text-[#5f5e5a]">Set owner phone, avian vet, and other emergency info <em>once</em>. Every bird uses this unless you edit it for that bird on its Emergency tab.</p>
      {!open ? (
        <div className="rounded-[18px] bg-[#efe9da] p-4 text-xs text-[#5f5e5a]">
          {filledCount === 0 ? "No defaults set yet — each bird needs its own contacts until you fill these in." : `${filledCount} of ${fields.length} default fields set.`}
        </div>
      ) : (
        <div className="space-y-3 rounded-[18px] bg-[#efe9da] p-4">
          {fields.map(([k, l, required]) => {
            const warn = isPhoneField(k) ? phoneWarning(d[k]) : null;
            return (
              <Field key={k} label={required ? `${l} *` : l}>
                {isAddressField(k) ? (
                  <AddressInput value={d[k] ?? ""} onChange={(v) => setD((prev: any) => ({ ...prev, [k]: v }))} />
                ) : (
                  <input
                    className="input" inputMode={isPhoneField(k) ? "tel" : undefined} value={d[k] ?? ""}
                    onChange={(e) => setD({ ...d, [k]: e.target.value })}
                    onBlur={isPhoneField(k) ? (e) => setD((prev: any) => ({ ...prev, [k]: formatPhoneOnBlur(e.target.value) })) : undefined}
                  />
                )}
                {warn && <span className="mt-1 block text-[11px] text-warn-red">{warn}</span>}
              </Field>
            );
          })}
          <button disabled={saving || fields.some(([k]) => isPhoneField(k) && !!phoneWarning(d[k]))} onClick={save} className="mt-2 w-full rounded-[14px] bg-[#1a3d2e] py-3 text-sm font-medium text-white disabled:opacity-50">
            {saving ? "Saving..." : "Save account defaults"}
          </button>
        </div>
      )}
    </section>
  );
}
