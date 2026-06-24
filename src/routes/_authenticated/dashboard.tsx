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
  Plus, Settings, Bell, Users, ChevronRight, Scale, CalendarHeart, Calendar,
  Feather, AlertCircle,
} from "lucide-react";
import { OwnerOnboarding } from "@/components/OwnerOnboarding";
import { Disclaimer } from "@/components/Disclaimer";
import { AddToHomeScreenPrompt } from "@/components/AddToHomeScreenPrompt";
import { toast } from "sonner";
import { ASPCA_POISON_CONTROL, isPhoneField, phoneWarning, formatPhoneOnBlur } from "@/lib/emergency";
import { isAddressField } from "@/lib/address";
import { AddressInput } from "@/components/AddressInput";
import { fetchScanFeed, getNotifSeenAt } from "@/lib/notificationsFeed";
import { BirdRecordBody } from "./birds/$birdId.index";
import { getHouseholdHome, type HomeHousehold } from "@/lib/home.functions";
import { getPastBirds } from "@/lib/handoff.functions";
import {
  groupWeights, weightGlance, upcomingMoments, buildTodayItems, daysSince,
  type HomeBird, type WeightEntry, type TodayItem, type WeightGlance, type UpcomingSit,
} from "@/lib/homeData";

const dashboardSearch = z.object({
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
  // Deep-link from a bird's Emergency tab / Account → open account defaults.
  emergencyDefaults: z.coerce.boolean().optional(),
});

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Home — Parrot Care Co-Pilot" }] }),
  validateSearch: dashboardSearch,
  component: Dashboard,
});

const BIRD_SELECT =
  "id, owner_id, name, species, photo_url, photo_position, is_foster, intake_date, birth_date, acquired_on, became_permanent_on";

function Dashboard() {
  const navigate = useNavigate();
  const { emergencyDefaults } = Route.useSearch();

  const { data: me } = useQuery({
    queryKey: ["owner-profile-name"],
    queryFn: async () => {
      const { data: u } = await getLocalUser();
      if (!u.user) return null;
      const { data } = await supabase.from("profiles").select("display_name").eq("id", u.user.id).maybeSingle();
      return { id: u.user.id, displayName: data?.display_name ?? "" };
    },
  });
  const firstName = (me?.displayName ?? "").trim().split(/\s+/)[0] || "";

  // Bell badge — unread scans (seen state is per-device).
  const { data: scanFeed = [] } = useQuery({ queryKey: ["scan-feed"], queryFn: fetchScanFeed });
  const [notifSeenAt] = useState(() => getNotifSeenAt());
  const unreadNotifs = scanFeed.filter((n) => new Date(n.created_at).getTime() > notifSeenAt).length;

  const { data: birds = [], isLoading: birdsLoading } = useQuery({
    queryKey: ["birds"],
    // Refetch on mount so a bird just added/handed-off flips solo↔flock without a
    // manual reload (and a logged weight elsewhere refreshes the pills).
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("birds").select(BIRD_SELECT).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const birdIds = useMemo(() => birds.map((b) => b.id), [birds]);
  const resolvePhoto = useBirdPhotos(birds.map((b) => b.photo_url), 256);

  // Latest weights for every accessible bird — pills, stale detection, Today.
  const { data: allWeights = [] } = useQuery({
    queryKey: ["home-weights", birdIds],
    enabled: birdIds.length > 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await supabase
        .from("weight_entries").select("bird_id, grams, measured_at")
        .in("bird_id", birdIds).order("measured_at", { ascending: false }).limit(600);
      return (data ?? []) as WeightEntry[];
    },
  });

  const { data: sits = [] } = useQuery({
    queryKey: ["all-sits"],
    queryFn: async () => {
      const { data } = await supabase.from("sits").select("id, sitter_name, start_date")
        .or("sitter_name.is.null,sitter_name.neq.__preview__").order("start_date", { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const householdFn = useServerFn(getHouseholdHome);
  const { data: household } = useQuery({ queryKey: ["home-household"], queryFn: () => householdFn() });

  const pastBirdsFn = useServerFn(getPastBirds);
  const { data: pastBirds } = useQuery({ queryKey: ["past-birds"], queryFn: () => pastBirdsFn() });
  const pastCount = pastBirds?.birds?.length ?? 0;

  // ---- derived ----
  const weightsByBird = useMemo(() => groupWeights(allWeights), [allWeights]);
  const homeBirds = birds as HomeBird[];
  const upcomingSits: UpcomingSit[] = useMemo(
    () => (sits as any[]).map((s) => ({ id: s.id, sitterName: s.sitter_name, startDate: s.start_date, daysUntil: -daysSince(s.start_date) })),
    [sits],
  );
  const moments = useMemo(() => upcomingMoments(homeBirds), [homeBirds]);
  const todayItems = useMemo(
    () => buildTodayItems(homeBirds, weightsByBird, upcomingSits, moments),
    [homeBirds, weightsByBird, upcomingSits, moments],
  );

  const onTodayNavigate = (item: TodayItem) => {
    if (item.to.kind === "sits") navigate({ to: "/sits" });
    else if (item.to.kind === "weight") navigate({ to: "/birds/$birdId/weight", params: { birdId: item.to.birdId } });
    else navigate({ to: "/birds/$birdId/moments", params: { birdId: item.to.birdId } });
  };

  const firstOwnedBirdId = (birds.find((b) => b.owner_id === me?.id) ?? birds[0])?.id as string | undefined;

  const fosterBirds = homeBirds.filter((b) => b.is_foster);
  const flockBirds = homeBirds.filter((b) => !b.is_foster);

  return (
    <div className="min-h-screen bg-[#f4f1e8] pb-24">
      <HomeHeader firstName={firstName} unreadNotifs={unreadNotifs} />

      <main className="mx-auto max-w-md space-y-6 px-5 pb-6 pt-1">
        {emergencyDefaults && <DefaultsPanel />}

        {birdsLoading ? (
          <HomeSkeleton />
        ) : birds.length === 0 ? (
          <EmptyHome />
        ) : birds.length === 1 ? (
          <>
            <TodayPanel items={todayItems} onNavigate={onTodayNavigate} />
            <div className="space-y-4"><BirdRecordBody birdId={birds[0].id} /></div>
            <HouseholdActivity household={household} />
            <HouseholdRow household={household} firstName={firstName} birdId={firstOwnedBirdId} />
            <FosterFooter count={pastCount} />
          </>
        ) : (
          <>
            <TodayPanel items={todayItems} onNavigate={onTodayNavigate} />

            <section className="space-y-3">
              <SectionHeaderCTA title="Your flock" ctaLabel="Add a bird" onCta={() => navigate({ to: "/birds/new" })} />
              {flockBirds.length === 0 ? (
                <p className="px-1 text-sm text-[#5b6b61]">No birds yet — start with your first.</p>
              ) : (
                <div className="space-y-3">
                  {flockBirds.map((b) => (
                    <BirdRow key={b.id} bird={b} photo={resolvePhoto(b.photo_url)} glance={weightGlance(weightsByBird.get(b.id) ?? [], b.is_foster)} />
                  ))}
                </div>
              )}
            </section>

            {fosterBirds.length > 0 && (
              <section className="space-y-3">
                <SectionHeaderCTA
                  title="In your care"
                  pill={`${fosterBirds.length} ${fosterBirds.length === 1 ? "foster" : "fosters"}`}
                  ctaLabel="Take in a bird"
                  onCta={() => navigate({ to: "/birds/new", search: { foster: true } as any })}
                />
                <div className="space-y-3">
                  {fosterBirds.map((b) => (
                    <BirdRow key={b.id} bird={b} photo={resolvePhoto(b.photo_url)} glance={weightGlance(weightsByBird.get(b.id) ?? [], b.is_foster)} foster />
                  ))}
                </div>
              </section>
            )}

            <HouseholdActivity household={household} />
            <HouseholdRow household={household} firstName={firstName} birdId={firstOwnedBirdId} />
            <FosterFooter count={pastCount} />
          </>
        )}

        <Disclaimer compact />
        <AddToHomeScreenPrompt />
      </main>

      <OwnerOnboarding />
      <style>{`.input{width:100%;border-radius:.75rem;background:white;border:1px solid var(--sage-200);padding:.65rem .8rem;font-size:16px;outline:none}.input:focus{border-color:var(--sage-600);box-shadow:0 0 0 3px rgb(74 103 65 / .15)}`}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function HomeHeader({ firstName, unreadNotifs }: { firstName: string; unreadNotifs: number }) {
  const h = new Date().getHours();
  const part = h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
  const greeting = firstName ? `${part}, ${firstName}.` : `${part}.`;
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  return (
    <header className="pt-[max(env(safe-area-inset-top),1rem)]">
      <div className="mx-auto flex max-w-md items-start justify-between gap-3 px-5 pb-2 pt-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[#8a8270]">{dateLabel}</p>
          <h1 className="font-display mt-0.5 text-[25px] font-medium leading-tight text-[#1a3d2e]">{greeting}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-1">
          <Link to="/notifications" aria-label="Notifications" className="relative grid size-[34px] place-items-center rounded-full bg-[#efe9da] text-[#1a3d2e]">
            <Bell className="size-[18px]" />
            {unreadNotifs > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full bg-[#854F0B] px-1 text-[10px] font-bold leading-4 text-white">
                {unreadNotifs > 9 ? "9+" : unreadNotifs}
              </span>
            )}
          </Link>
          <Link to="/account" aria-label="Settings" className="grid size-[34px] place-items-center rounded-full bg-[#efe9da] text-[#1a3d2e]">
            <Settings className="size-[18px]" />
          </Link>
        </div>
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Shared section header with a text-link CTA (NEW reusable pattern)
// ---------------------------------------------------------------------------
function SectionHeaderCTA({ title, pill, ctaLabel, onCta }: { title: string; pill?: string; ctaLabel: string; onCta: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-[14.5px] font-medium text-[#1a3d2e]">{title}</h2>
        {pill && <span className="rounded-full bg-[#e8f0ec] px-2 py-[3px] text-[11px] font-medium text-[#2d6a4f]">{pill}</span>}
      </div>
      <button type="button" onClick={onCta} className="flex items-center gap-1 text-[13px] font-medium text-[#2d6a4f] active:opacity-70">
        <Plus className="size-3.5" strokeWidth={2.4} /> {ctaLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Today panel (adaptive — hidden entirely when empty)
// ---------------------------------------------------------------------------
function TodayPanel({ items, onNavigate }: { items: TodayItem[]; onNavigate: (i: TodayItem) => void }) {
  if (items.length === 0) return null;
  return (
    <section
      className="overflow-hidden rounded-[18px] border border-[#dccfa8]"
      style={{ background: "linear-gradient(180deg,#efe9da,#e7e0c8)" }}
    >
      <div className="flex items-baseline justify-between px-4 pb-1.5 pt-3.5">
        <h2 className="font-display text-[17px] font-medium text-[#1a3d2e]">Today</h2>
        <span className="text-[11px] font-medium text-[#8a8270]">{items.length} {items.length === 1 ? "thing" : "things"}</span>
      </div>
      <ul>
        {items.map((it) => (
          <li key={it.id} className="border-t border-[#e0d8c4]/70 first:border-t-0">
            <button type="button" onClick={() => onNavigate(it)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-black/[0.03]">
              <span
                className="grid size-8 shrink-0 place-items-center rounded-full"
                style={it.tone === "amber" ? { background: "#f6e7c4", color: "#854F0B" } : { background: "#d6e8dc", color: "#2d6a4f" }}
              >
                {it.tone === "amber" ? <AlertCircle className="size-4" /> : it.to.kind === "sits" ? <Calendar className="size-4" /> : <CalendarHeart className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-[#1a3d2e]">{it.title}</span>
                <span className="block truncate text-xs text-[#5b6b61]">{it.meta}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-[#8a8270]" />
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

function PhotoTile({ photo, name, species }: { photo: SignedPhoto | null; name: string; species: string | null; }) {
  const initial = (name?.slice(0, 1) ?? "?").toUpperCase();
  return (
    <div className="size-[62px] shrink-0 overflow-hidden rounded-[14px]" style={{ background: gradientFor(species || name) }}>
      {photo ? (
        <img
          src={photo.url} alt={name} loading="lazy" decoding="async"
          onError={(e) => { if (photo.original && e.currentTarget.src !== photo.original) e.currentTarget.src = photo.original; }}
          style={{ objectPosition: undefined }}
          className="size-full object-cover"
        />
      ) : (
        <div className="grid size-full place-items-center">
          <span className="font-display text-2xl font-medium text-white/90">{initial}</span>
        </div>
      )}
    </div>
  );
}

function GlancePill({ glance }: { glance: WeightGlance }) {
  if (glance.state === "none") return <span className="text-xs text-[#8a8270]">No weights yet</span>;
  const pill = glance.pill;
  const cls = pill.tone === "good"
    ? "bg-[#d6e8dc] text-[#1a5e3f]"
    : "bg-[#f6e7c4] text-[#854F0B]";
  return (
    <span className="inline-flex items-center gap-1 text-sm text-[#1a3d2e]">
      {glance.current}<span className="text-xs text-[#5b6b61]">g</span>
      <span className={`ml-1 rounded-full px-2 py-[3px] text-[11.5px] font-medium ${cls}`}>{pill.label}</span>
    </span>
  );
}

function BirdRow({ bird, photo, glance, foster }: { bird: HomeBird; photo: SignedPhoto | null; glance: WeightGlance; foster?: boolean }) {
  const fosterStatus = foster
    ? glance.state === "stale"
      ? { tone: "attention" as const, label: "Needs a weigh-in" }
      : { tone: "good" as const, label: "All good" }
    : null;
  return (
    <Link
      to="/birds/$birdId" params={{ birdId: bird.id }}
      className="flex items-center gap-3 rounded-[18px] border border-[#e0d8c4] bg-white p-3 active:scale-[0.995]"
      style={{ boxShadow: "0 1px 0 rgba(40,50,40,.02), 0 6px 14px -8px rgba(40,50,40,.08)" }}
    >
      <PhotoTile photo={photo} name={bird.name} species={bird.species} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="font-display truncate text-[17px] font-medium leading-tight text-[#1a3d2e]">{bird.name}</h3>
          {foster && <span className="shrink-0 rounded-full bg-[#cfe3dc] px-2 py-0.5 text-[10px] font-medium text-[#1a5e3f]">Foster</span>}
        </div>
        <p className="truncate text-xs text-[#5b6b61]">{bird.species || "Parrot"}</p>
        {foster && bird.intake_date && (
          <p className="text-xs text-[#8a8270]">With you since {fmtShort(bird.intake_date)}</p>
        )}
        <div className="mt-1">
          {fosterStatus ? (
            <span className={`text-xs font-medium ${fosterStatus.tone === "good" ? "text-[#2d6a4f]" : "text-[#854F0B]"}`}>{fosterStatus.label}</span>
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
      <h2 className="font-display text-[14.5px] font-medium text-[#1a3d2e]">From your household</h2>
      <ul className="space-y-1.5">
        {activity.map((a) => (
          <li key={a.id} className="flex items-start gap-2.5 rounded-[14px] bg-white px-3 py-2.5 ring-1 ring-[#eee6d4]">
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: "var(--house,#4a7c95)" }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[#1a3d2e]"><span className="font-medium">{a.actorName}</span> {a.summary} for {a.birdName}</p>
              <p className="text-xs text-[#8a8270]">{fmtAgo(a.at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Quiet Household row (account-level entry → per-bird access hub)
// ---------------------------------------------------------------------------
function HouseholdRow({ household, firstName, birdId }: { household?: HomeHousehold; firstName: string; birdId?: string }) {
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
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#efe9da] text-[#8a8270]"><Users className="size-[18px]" /></span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[#1a3d2e]">{primary}</p>
        <p className="truncate text-xs text-[#5b6b61]">{secondary}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-[#8a8270]" />
    </div>
  );

  if (!birdId) return <div className="px-1">{inner}</div>;
  return (
    <Link to="/birds/$birdId/access" params={{ birdId }} className="block px-1 active:opacity-80">{inner}</Link>
  );
}
function Avatar({ initial, dim }: { initial: string; dim?: boolean }) {
  return (
    <span className={`grid size-9 place-items-center rounded-full ring-2 ring-[#f4f1e8] text-[11px] font-medium text-white ${dim ? "bg-[#8a8270]" : "bg-[#2d6a4f]"}`}>
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
    <p className="font-display text-center text-[13px] italic text-[#8a8270]">
      You've helped {count} {count === 1 ? "bird" : "birds"} find a home.
    </p>
  );
}

// ---------------------------------------------------------------------------
// Empty + skeleton
// ---------------------------------------------------------------------------
function EmptyHome() {
  return (
    <section className="rounded-[18px] border border-[#e0d8c4] bg-white p-8 text-center" style={{ boxShadow: "0 6px 14px -8px rgba(40,50,40,.08)" }}>
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-[#e8f0ec] text-[#2d6a4f]"><Feather className="size-6" /></span>
      <h2 className="font-display mt-3 text-[19px] font-medium text-[#1a3d2e]">Welcome to your flock</h2>
      <p className="mt-1.5 text-sm text-[#5b6b61]">Add your first bird to start their living record — care plan, weight, moments, and more.</p>
      <Link to="/birds/new" className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-[14px] bg-[#1a3d2e] px-5 text-sm font-medium text-white">
        <Plus className="size-4" /> Add a bird
      </Link>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 rounded-[18px] border border-[#e0d8c4] bg-white p-3">
          <div className="size-[62px] shrink-0 animate-pulse rounded-[14px] bg-[#e7e0c8]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-[#e7e0c8]" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-[#e7e0c8]" />
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
        <h2 className="font-display text-[19px] font-medium text-[#1a3d2e]">Account emergency defaults</h2>
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
