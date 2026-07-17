import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { BIRD_LIST_SELECT } from "@/lib/birdListSelect";
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
import { CaregiverCoveringSection, useActiveCaregiver } from "@/components/CaregiverHome";
import { HomeChecklist } from "@/components/HomeChecklist";
import { getHouseholdHome, resolveOwnerNames, type HomeHousehold } from "@/lib/home.functions";
import { useMyPermissions } from "@/lib/useCapability";
import {
  groupWeights, weightGlance, upcomingMoments, buildTodayItems, buildHomeStateCopy, daysSince,
  type HomeBird, type WeightEntry, type TodayItem, type WeightGlance, type UpcomingSit,
} from "@/lib/homeData";
import { QUICKSTART_ONBOARDING } from "@/lib/flags";
import { track } from "@/lib/analytics";

// Quickstart onboarding: per-bird invite state ("pending" until the owner picks
// a path or dismisses). localStorage on purpose — additive, no schema change,
// and worst case (new device) the invite simply doesn't resurface.
type CareInviteState = "pending" | "done" | null;
function careInviteKey(birdId: string) { return `care-invite:${birdId}`; }
function getCareInviteState(birdId: string): CareInviteState {
  try { return (localStorage.getItem(careInviteKey(birdId)) as CareInviteState) ?? null; } catch { return null; }
}
function setCareInviteState(birdId: string, state: "pending" | "done") {
  try { localStorage.setItem(careInviteKey(birdId), state); } catch { /* ignore */ }
}

const dashboardSearch = z.object({
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
  // Deep-link from a bird's Emergency tab / Account → open account defaults.
  emergencyDefaults: z.coerce.boolean().optional(),
  // Quickstart onboarding: /birds/new lands here with the new bird's id so Home
  // can confirm the add and offer the three-door care-profile invite.
  added: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Home — Kya & Co." }] }),
  validateSearch: dashboardSearch,
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const { emergencyDefaults, added } = Route.useSearch();

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
  const unreadNotifs = scanFeed.filter((n) => new Date(n.created_at).getTime() > notifSeenAt).length;

  const { data: birds = [], isLoading: birdsLoading } = useQuery({
    queryKey: ["birds"],
    // No per-mount refetch: the 60s staleTime paints from cache on revisit, and
    // every bird mutation (add / hand-off / edit / delete) invalidates ["birds"],
    // so a solo↔flock change still appears immediately without a blocking fetch on
    // every Home visit. Shape is shared with the Sits screen via BIRD_LIST_SELECT.
    queryFn: async () => {
      // Active flock only — a passed bird leaves Home entirely (it lives in the
      // Remembering menu entry; its record is preserved, just not ambient here).
      const { data, error } = await supabase.from("birds").select(BIRD_LIST_SELECT).is("passed_at", null).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const birdIds = useMemo(() => birds.map((b) => b.id), [birds]);
  // 800px (not 256) so the flock-card crop is byte-for-byte the same image the
  // reposition "Flock card" preview and the bird-record hero use — a smaller
  // transform cropped to a different aspect and broke the WYSIWYG promise.
  const resolvePhoto = useBirdPhotos(birds.map((b) => b.photo_url), 800);

  // Latest weights for every accessible bird — pills, stale detection, Today.
  const { data: allWeights = [] } = useQuery({
    queryKey: ["home-weights", birdIds],
    enabled: birdIds.length > 0,
    // No per-mount refetch: 60s staleTime paints the pills from cache on revisit;
    // weight logging (manual log + health-check weigh-in) invalidates
    // ["home-weights"], so a new weight refreshes Home immediately without a
    // blocking fetch on every visit.
    queryFn: async () => {
      // Newest-first + capped: the pills / stale detection / Today only use the
      // most recent weights per bird, so the cap trims old history we never read.
      // 300 comfortably covers recent weights across a realistic flock (was 600).
      const { data } = await supabase
        .from("weight_entries").select("bird_id, grams, measured_at")
        .in("bird_id", birdIds).order("measured_at", { ascending: false }).limit(300);
      return (data ?? []) as WeightEntry[];
    },
  });

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
    return [...m.entries()].map(([ownerId, birds]) => ({ ownerId, birds, ownerName: ownerNames?.[ownerId] ?? null }));
  }, [memberBirds, ownerNames]);
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

  const { data: caregiver } = useActiveCaregiver();

  // Quickstart onboarding: arriving with ?added=<id> confirms the add and arms
  // the three-door care-profile invite (persisted per-bird in localStorage so
  // it survives a reload until the owner picks a path or dismisses it).
  const addedToastRef = useRef<string | null>(null);
  useEffect(() => {
    if (!QUICKSTART_ONBOARDING || !added) return;
    const b = (birds as any[]).find((x) => x.id === added);
    if (!b || addedToastRef.current === added) return;
    addedToastRef.current = added;
    setCareInviteState(added, "pending");
    setInviteVersion((v) => v + 1); // the memo below ran before this effect
    toast.success(`${b.name} is in your flock. You're all set.`);
  }, [added, birds]);
  // The invite renders for the newest owned bird whose invite is still pending
  // and whose setup hasn't been completed — usually the bird just added.
  const [inviteVersion, setInviteVersion] = useState(0);
  const inviteBird = useMemo(() => {
    if (!QUICKSTART_ONBOARDING || demo) return null;
    void inviteVersion; // recompute after choose/dismiss
    return (
      (ownedBirds as any[]).find(
        (b) => !b.setup_complete && getCareInviteState(b.id) === "pending",
      ) ?? null
    );
  }, [ownedBirds, demo, inviteVersion]);

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
    : birds.length === 0 ? "Add your first bird to start their record."
    : buildHomeStateCopy(homeBirds, weightsByBird, sitsForStateCopy, moments);
  const heroCta: HeroCta | undefined =
    !birdsLoading && birds.length === 0
      ? { label: "Add a bird", tone: "lime", icon: <Plus className="size-4" />, onPress: () => navigate({ to: "/birds/new" }) }
      : undefined;

  // No caregiver "takeover": ONE Home for every account. Owning a bird is derived
  // (birds.owner_id === me), not a signup type — so a caregiver-only account gets
  // the same Home (with "Add a bird" always available; their own birds appear
  // under "Your birds" once they add any). A sit they're actively covering shows
  // as the CaregiverCoveringSection overlay below, never a full-screen takeover
  // that would hide their birds or the add-bird affordance.

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
      <HomeHeader firstName={firstName} unreadNotifs={unreadNotifs} stateCopy={stateCopy} cta={heroCta} />

      <main className="space-y-6 px-5 pb-6 pt-5">
        {emergencyDefaults && <DefaultsPanel />}

        {/* One-time post-setup checklist for new accounts (any type). Self-hides
            when done / dismissed / no longer a new account — see HomeChecklist. */}
        {!demo && <HomeChecklist />}

        {birdsLoading && !demo ? (
          <HomeSkeleton />
        ) : !demo && birds.length === 0 ? (
          <EmptyHome />
        ) : (
          // ONE Home for everyone — one bird or twenty. (Previously birds.length
          // === 1 rendered the bird record inline, which stripped the flock list,
          // broke the onboarding tour's owner-flock anchor, and made Home
          // indistinguishable from the bird record. A single bird now shows as one
          // card in the flock, with the same Today / household / guidance.)
          <>
            <TodayPanel items={todayItemsView} onNavigate={onTodayNavigate} />

            {/* A sit you're covering (any account): the sitter-style "Birds in
                your care" cards (per-bird progress; tap a bird to open its
                checklist + health scan). Active window only — the hook returns
                only sits covering today. This is a section on the one shared Home,
                not a takeover. */}
            {!demo && caregiver?.sits?.map((s) => (
              <CaregiverCoveringSection key={s.id} sit={s} />
            ))}

            {inviteBird && (
              <CareProfileInvite
                bird={inviteBird}
                onChoose={(path) => {
                  setCareInviteState(inviteBird.id, "done");
                  setInviteVersion((v) => v + 1);
                  track("care_path_chosen", { path });
                  if (path === "guided") {
                    navigate({ to: "/birds/$birdId/setup", params: { birdId: inviteBird.id }, search: { step: 1 } });
                  } else if (path === "self_serve") {
                    navigate({ to: "/birds/$birdId/plan", params: { birdId: inviteBird.id } });
                  }
                }}
              />
            )}

            <section className="space-y-3" data-coach="owner-flock">
              <SectionHeaderCTA title={showHouseholds ? "Your birds" : "Your flock"} ctaLabel="Add a bird" onCta={() => navigate({ to: "/birds/new" })} />
              {flockBirds.length === 0 ? (
                <p className="px-1 text-sm text-[#5b6b61]">No birds yet — start with your first.</p>
              ) : (
                <div className="space-y-3">
                  {flockBirds.map((b) => (
                    <BirdRow key={b.id} bird={b} photo={photoFor(b)} glance={glanceFor(b)} concern={concernByBird.has(b.id)} justAdded={inviteBird?.id === b.id} />
                  ))}
                </div>
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
                  <h2 className="t-section">{g.ownerName ? `${possessive(g.ownerName)} household` : "A household you help with"}</h2>
                  <p className="t-meta text-[var(--teal-on-cream)]">You help here</p>
                </div>
                <div className="space-y-3">
                  {g.birds.map((b, bi) =>
                    gi === 0 && bi === 0 ? (
                      <div key={b.id} data-coach="member-household-bird">
                        <BirdRow bird={b} photo={photoFor(b)} glance={glanceFor(b)} concern={concernByBird.has(b.id)} />
                      </div>
                    ) : (
                      <BirdRow key={b.id} bird={b} photo={photoFor(b)} glance={glanceFor(b)} concern={concernByBird.has(b.id)} />
                    ),
                  )}
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
                    <BirdRow key={b.id} bird={b} photo={photoFor(b)} glance={glanceFor(b)} foster concern={concernByBird.has(b.id)} justAdded={inviteBird?.id === b.id} />
                  ))}
                </div>
              </section>
            )}

            <HouseholdActivity household={householdView} />
            <HouseholdRow household={householdView} firstName={firstName} />
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

// ---------------------------------------------------------------------------
// Quickstart onboarding: three-door care-profile invite (Home, post-add)
// ---------------------------------------------------------------------------
function CareProfileInvite({ bird, onChoose }: { bird: HomeBird; onChoose: (path: "guided" | "self_serve" | "later") => void }) {
  return (
    <section
      className="rounded-[18px] bg-white p-4 ring-1 ring-[var(--line2)]"
      style={{ boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" }}
    >
      <h2 className="t-item text-[17px]">Build {possessive(bird.name)} care profile?</h2>
      <p className="mt-1 text-[13px] leading-[1.5] text-[var(--ink2)]">
        Feeding, routine, quirks, emergency info — the more you add, the more a sitter can help. No rush.
      </p>
      <div className="mt-3.5 space-y-2">
        <button
          onClick={() => onChoose("guided")}
          className="flex w-full items-center justify-center gap-2 rounded-[13px] bg-[var(--ink)] py-3 text-[14px] font-[500] text-white active:scale-[0.99]"
        >
          Walk me through it
        </button>
        <button
          onClick={() => onChoose("self_serve")}
          className="flex w-full items-center justify-center rounded-[13px] border border-[var(--line)] bg-white py-3 text-[14px] font-[500] text-[var(--ink)] active:scale-[0.99]"
        >
          I'll add bits as I go
        </button>
      </div>
      <div className="mt-2 text-center">
        <button onClick={() => onChoose("later")} className="py-1 text-[12.5px] font-[500] text-[var(--mute)] underline underline-offset-2">
          Maybe later
        </button>
      </div>
    </section>
  );
}

/** "Sarah" -> "Sarah's", "Chris" -> "Chris'". */
function possessive(name: string): string {
  const n = name.trim();
  return /s$/i.test(n) ? `${n}'` : `${n}'s`;
}

function BirdRow({ bird, photo, glance, foster, concern, justAdded }: { bird: HomeBird; photo: SignedPhoto | null; glance: WeightGlance; foster?: boolean; concern?: boolean; justAdded?: boolean }) {
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
          {justAdded && <StatusPill tone="good">Just added</StatusPill>}
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
