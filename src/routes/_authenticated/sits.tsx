import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { Plus, Calendar, CalendarPlus, ChevronRight } from "lucide-react";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";
import { SitForm } from "@/components/SitForm";
import { ActiveSitCard, UpcomingSitCard, type SitBird, type ListSit } from "@/components/SitListCards";
import { useServerFn } from "@tanstack/react-start";
import { resolveHouseholdNames } from "@/lib/home.functions";
import { memberDisplayName, firstName } from "@/lib/memberDisplay";
import { InkHero, SectionHead, Card, IconTile } from "@/components/system";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { weekdayMonthDay, monthDay, daysUntil } from "@/lib/dates";

// Dedicated Sits tab: create / manage sits. Reuses the same query keys as the
// dashboard (["birds"], ["all-sits"]) so the cache is shared. Past sits live on
// their own screen (/sits/past), reached from the link below.
const sitsSearch = z.object({
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/sits")({
  head: () => ({ meta: [{ title: "Sits — Kya & Co." }] }),
  validateSearch: sitsSearch,
  component: SitsPage,
});

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function SitsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { newSit, preselectBirdId } = Route.useSearch();

  const { data: birds = [] } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("birds")
        .select("id, owner_id, name, species, photo_url, photo_position, setup_complete, setup_step, normal_weight")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sits = [], isLoading: sitsLoading } = useQuery({
    queryKey: ["all-sits"],
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sits")
        .select("*, sit_birds(bird_id)")
        .or("sitter_name.is.null,sitter_name.neq.__preview__")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const refreshSits = () => qc.invalidateQueries({ queryKey: ["all-sits"] });
  const birdLookup = Object.fromEntries(birds.map((b: any) => [b.id, b]));

  // Only a bird's OWNER may set up / edit a sit. `birds` includes birds the user
  // only has household access to (RLS), so gate creation + editing on actual
  // ownership (birds.owner_id). Household members get a read-only Sits tab.
  const { data: myId } = useQuery({
    queryKey: ["me-id"],
    queryFn: async () => (await getLocalUser()).data.user?.id ?? null,
  });
  const ownedBirds = birds.filter((b: any) => b.owner_id === myId);
  const canManageSits = !!myId && ownedBirds.length > 0;

  // "In charge" is only meaningful in a multi-member household — for a solo owner
  // the lead is trivially them, so don't badge every card. True when the owner
  // has any household member across their birds.
  const { data: hasHousehold = false } = useQuery({
    queryKey: ["owner-has-household", myId, ownedBirds.map((b: any) => b.id).sort().join(",")],
    enabled: canManageSits,
    queryFn: async () => {
      const { count } = await supabase
        .from("bird_members")
        .select("user_id", { count: "exact", head: true })
        .in("bird_id", ownedBirds.map((b: any) => b.id))
        .eq("role", "household");
      return (count ?? 0) > 0;
    },
  });
  const today = new Date().toISOString().slice(0, 10);
  const allSits = sits as any[];

  // State buckets. Active = underway today (most-recently-started first).
  // Upcoming = strictly future. Past lives on its own screen.
  const actives = allSits
    .filter((s) => s.start_date <= today && s.end_date >= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const upcoming = allSits
    .filter((s) => s.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const pastCount = allSits.filter((s) => s.end_date < today).length;

  // Batch-resolve display names for caregivers AND sit leads ("in charge").
  // Resolve caregiver + lead names via the service role (the authenticated
  // client can't read other users' profiles — profiles RLS is self-only).
  const personIds = [...new Set(allSits.flatMap((s) => [s.caregiver_user_id, s.lead_user_id]).filter(Boolean) as string[])];
  const resolveNames = useServerFn(resolveHouseholdNames);
  const { data: nameMap = {} } = useQuery({
    queryKey: ["sit-person-names", personIds.slice().sort().join(",")],
    enabled: personIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => resolveNames({ data: { userIds: personIds } }),
  });
  const displayFor = (id: string): string => memberDisplayName((nameMap as Record<string, any>)[id]);
  // Lead = who's in charge. First name only, per the content-label treatment.
  const leadFirstName = (s: any): string | null =>
    s.lead_user_id ? firstName(displayFor(s.lead_user_id)) || null : null;
  const caregiverName = (s: any): string =>
    s.caregiver_user_id ? displayFor(s.caregiver_user_id) : (s.sitter_name?.trim() || "Your sitter");

  // Bird photos are stored as bucket PATHS; resolve them to signed URLs (small
  // transform — the chips are tiny dots) so the chip <img> actually loads.
  const resolvePhoto = useBirdPhotos(birds.map((b: any) => b.photo_url), 96);
  const birdsFor = (s: any): SitBird[] =>
    ((s.sit_birds ?? []) as any[])
      .map((sb: any) => birdLookup[sb.bird_id])
      .filter(Boolean)
      .map((b: any) => {
        // Pass BOTH the transformed url and the untransformed original so the
        // chip can fall back if the width-transform fails (else: blank dot).
        const sp = resolvePhoto(b.photo_url);
        return { id: b.id, name: b.name, photo_url: sp?.url ?? null, photo_original: sp?.original ?? null, photo_position: b.photo_position };
      });

  // ---- Adaptive hero copy ---------------------------------------------------
  let heroHeadline = "Going away?";
  let heroBody = "For when you can't be there — set up a sit and share what they need to know.";
  if (actives.length > 0) {
    const a = actives[0];
    heroHeadline = `${caregiverName(a)} is sitting now.`;
    heroBody = `Through ${weekdayMonthDay(a.end_date)}.`;
  } else if (upcoming.length > 0) {
    const n = upcoming[0];
    const d = daysUntil(n.start_date);
    const when = d <= 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`;
    heroHeadline = `${caregiverName(n)} arrives ${when}.`;
    const names = birdsFor(n).map((b) => b.name);
    heroBody = `${monthDay(n.start_date)} → ${monthDay(n.end_date)}.${names.length ? ` ${joinNames(names)}.` : ""}`;
  }

  const noSits = actives.length === 0 && upcoming.length === 0;

  return (
    <div className="min-h-screen bg-[var(--cream)] pb-nav">
      <div className="mx-auto max-w-md">
        <InkHero
          showBrand
          eyebrow="Sits"
          headline={heroHeadline}
          body={heroBody}
          trailingIcons={<OwnerHeaderIcons />}
        />

        <main className="space-y-4 px-5 pt-5">
          {birds.length === 0 ? (
            <Card>
              <div className="p-8 text-center">
                <div className="flex justify-center">
                  <span className="grid size-12 place-items-center rounded-[14px] bg-[var(--pale2)] text-[var(--moss)]">
                    <Calendar className="size-6" />
                  </span>
                </div>
                <p className="t-section mt-3">Add a bird first</p>
                <p className="t-body mx-auto mt-1.5 max-w-[34ch] text-[var(--ink2)]">
                  A sit shares one or more birds' care plans with a sitter. Add a bird to create your first sit.
                </p>
                <Link
                  to="/birds/new"
                  className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-[12px] bg-[var(--ink)] px-[18px] py-[11px] text-[15px] font-[500] text-white active:scale-[0.99]"
                >
                  <Plus className="size-4" /> Add bird
                </Link>
              </div>
            </Card>
          ) : (
            <>
              {/* Create flow — owners only, and only over birds they own.
                  SitForm owns its open state (?newSit). */}
              {canManageSits && (
                <SitForm
                  birds={ownedBirds}
                  onSaved={refreshSits}
                  initialOpen={!!newSit}
                  preselectBirdId={preselectBirdId}
                  activeSit={actives[0] ?? null}
                  returnTo="/sits"
                  hidePrompt
                />
              )}

              {sitsLoading ? (
                <div className="space-y-3">
                  {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-[18px] bg-[var(--cream2)]" />)}
                </div>
              ) : (
                <>
                  {/* Active cards first (priority order). */}
                  {actives.map((s) => (
                    <ActiveSitCard
                      key={s.id}
                      sit={s as ListSit}
                      birds={birdsFor(s)}
                      allBirdsCount={birds.length}
                      caregiverName={caregiverName(s)}
                      leadName={hasHousehold ? leadFirstName(s) : null}
                      allBirds={s.owner_id === myId ? ownedBirds : undefined}
                      onChange={refreshSits}
                    />
                  ))}

                  {upcoming.length > 0 && (
                    <section className="space-y-3">
                      <SectionHead
                        title="Coming up"
                        trailing={<span className="t-eyebrow text-[var(--teal-on-cream)]">{upcoming.length} {upcoming.length === 1 ? "sit" : "sits"}</span>}
                      />
                      {upcoming.map((s, i) => (
                        <UpcomingSitCard
                          key={s.id}
                          sit={s as ListSit}
                          birds={birdsFor(s)}
                          allBirdsCount={birds.length}
                          caregiverName={caregiverName(s)}
                          leadName={hasHousehold ? leadFirstName(s) : null}
                          allBirds={s.owner_id === myId ? ownedBirds : undefined}
                          onChange={refreshSits}
                          // First upcoming is always expanded; the rest collapse
                          // to a header (tap to expand).
                          collapsible={i > 0}
                        />
                      ))}
                    </section>
                  )}

                  {noSits && (
                    <Card>
                      <div className="p-8 text-center">
                        <div className="flex justify-center">
                          <IconTile tone="ink-lime" size={48} icon={<CalendarPlus className="size-6" />} />
                        </div>
                        <p className="t-section mt-3">No sits scheduled.</p>
                        <p className="t-body mx-auto mt-1.5 max-w-[34ch] text-[var(--ink2)]">
                          A sit shares today's routine, a daily health scan, and one-tap emergency contacts with whoever's covering.
                        </p>
                      </div>
                    </Card>
                  )}

                  {canManageSits ? (
                    <button
                      type="button"
                      onClick={() => navigate({ to: "/sits", search: { newSit: true } })}
                      className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--lime)] text-[15px] font-[500] text-[var(--ink)] active:scale-[0.99]"
                    >
                      <Plus className="size-4" /> Set up a sit
                    </button>
                  ) : (
                    // Household members can view sits they're covering, but only a
                    // bird's owner can set one up.
                    <p className="px-1 text-center t-meta">Only a bird's owner can set up a sit.</p>
                  )}

                  {pastCount > 0 && (
                    <Link
                      to="/sits/past"
                      className="flex items-center justify-center gap-1 py-1 text-[14px] font-[500] text-[var(--moss)] active:opacity-80"
                    >
                      Past sits ({pastCount}) <ChevronRight className="size-4" />
                    </Link>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
