import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { Plus, Calendar, CalendarPlus, ChevronDown } from "lucide-react";
import { OwnerHeaderIcons } from "@/components/OwnerHeader";
import { SitForm } from "@/components/SitForm";
import { ActiveSitCard, UpcomingSitCard, PastSitCard, type SitBird, type ListSit } from "@/components/SitListCards";
import { useServerFn } from "@tanstack/react-start";
import { resolveHouseholdNames, resolveOwnerNames } from "@/lib/home.functions";
import { memberDisplayName, firstName } from "@/lib/memberDisplay";
import { InkHero, SectionHead, Card, IconTile } from "@/components/system";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { BIRD_LIST_SELECT } from "@/lib/birdListSelect";
import { weekdayMonthDay, monthDay, daysUntil } from "@/lib/dates";

// Dedicated Sits tab: create / manage sits. Shares the ["birds"] cache with the
// dashboard via BIRD_LIST_SELECT (identical shape, so neither poisons the other).
// Its OWN ["sits-full"] key holds the full sit rows (+ sit_birds join) it needs —
// separate from the dashboard's minimal ["all-sits"] so the two shapes don't
// collide. Sit mutations invalidate both. Past sits (end_date < today) render
// inline in a collapsible section from this same ["sits-full"] data — no route.
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
  const [pastOpen, setPastOpen] = useState(false);
  const { newSit, preselectBirdId } = Route.useSearch();

  const { data: birds = [] } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      // Active flock only (passed birds are excluded everywhere on Home/Sits —
      // same filter as the dashboard so the shared ["birds"] cache stays consistent).
      const { data, error } = await supabase
        .from("birds")
        .select(BIRD_LIST_SELECT)
        .is("passed_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sits = [], isLoading: sitsLoading } = useQuery({
    // Own key (not the dashboard's ["all-sits"]) — different shape, so no cache
    // collision. No per-mount refetch: 60s staleTime paints from cache; sit
    // create/edit/delete calls refreshSits() to update immediately.
    queryKey: ["sits-full"],
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

  // A sit change affects this screen (["sits-full"]), the dashboard's upcoming-sit
  // row (["all-sits"]), and the past-sits archive (["sits-archive"]).
  const refreshSits = () => {
    qc.invalidateQueries({ queryKey: ["sits-full"] });
    qc.invalidateQueries({ queryKey: ["all-sits"] });
    qc.invalidateQueries({ queryKey: ["sits-archive"] });
  };
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
  // Upcoming = strictly future. Past = ended (end_date < today) — shown inline in
  // a collapsible section below, most-recently-ended first (no separate route).
  const actives = allSits
    .filter((s) => s.start_date <= today && s.end_date >= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const upcoming = allSits
    .filter((s) => s.start_date > today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const pastSits = allSits
    .filter((s) => s.end_date < today)
    .sort((a, b) => b.end_date.localeCompare(a.end_date));

  // Batch-resolve display names for caregivers AND sit leads ("in charge").
  // Resolve caregiver + lead names via the service role (the authenticated
  // client can't read other users' profiles — profiles RLS is self-only).
  const personIds = [...new Set(allSits.map((s) => s.caregiver_user_id).filter(Boolean) as string[])];
  const resolveNames = useServerFn(resolveHouseholdNames);
  const { data: nameMap = {} } = useQuery({
    queryKey: ["sit-person-names", personIds.slice().sort().join(",")],
    enabled: personIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => resolveNames({ data: { userIds: personIds } }),
  });
  const displayFor = (id: string): string => memberDisplayName((nameMap as Record<string, any>)[id]);
  // "In charge" = who is actually COVERING the sit (doing the sitting), keyed on
  // caregiver_user_id — NOT lead_user_id. lead_user_id is overloaded: SitForm
  // sets it to the household cover for a household sit but to the OWNER for an
  // external sitter (as the responsible contact), so keying "in charge" on it
  // wrongly flagged an owner as in charge of their own externally-sat sit.
  // caregiver_user_id is the covering household member (null for external sits,
  // where the covering person is the external sitter, shown via caregiverName).
  const leadFirstName = (s: any): string | null =>
    s.caregiver_user_id ? firstName(displayFor(s.caregiver_user_id)) || null : null;
  const caregiverName = (s: any): string =>
    s.caregiver_user_id ? displayFor(s.caregiver_user_id) : (s.sitter_name?.trim() || "Your sitter");

  // Context markers (mirrors the flock grouping): whose-birds tag shows ONLY when
  // the user has sits in BOTH their own birds AND a household they help with. A
  // sit is single-owner (sit.owner_id), so we label by that. Owner display names
  // for helped-with households come via resolveOwnerNames (RLS-gated server fn);
  // resolveHouseholdNames only resolves the user's OWN household members.
  const bothContexts =
    !!myId && allSits.some((s) => s.owner_id === myId) && allSits.some((s) => s.owner_id && s.owner_id !== myId);
  const sitOwnerIds = [...new Set(allSits.map((s) => s.owner_id).filter((o) => !!o && o !== myId) as string[])];
  const resolveOwners = useServerFn(resolveOwnerNames);
  const { data: ownerNames = {} } = useQuery({
    queryKey: ["sit-owner-names", sitOwnerIds.slice().sort().join(",")],
    enabled: sitOwnerIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: () => resolveOwners({ data: { ownerIds: sitOwnerIds } }),
  });
  const contextTagFor = (s: any): { kind: "own" | "household"; ownerName?: string | null } | undefined =>
    !bothContexts
      ? undefined
      : s.owner_id === myId
        ? { kind: "own" }
        : { kind: "household", ownerName: (ownerNames as Record<string, string>)[s.owner_id] ?? null };
  // "You're in charge" only when the current user is the one COVERING the sit
  // (the covering caregiver), never merely because they own the birds.
  const iAmLead = (s: any): boolean => !!myId && s.caregiver_user_id === myId;

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
                      iAmLead={iAmLead(s)}
                      iOwnSit={s.owner_id === myId}
                      contextTag={contextTagFor(s)}
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
                          iAmLead={iAmLead(s)}
                          iOwnSit={s.owner_id === myId}
                          contextTag={contextTagFor(s)}
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
                          A sit shares today's routine, a daily health check, and one-tap emergency contacts with whoever's covering.
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

                  {/* Past sits — inline collapsible (no route). Hidden entirely
                      when there are none. */}
                  {pastSits.length > 0 && (
                    <section className="pt-1">
                      <button
                        type="button"
                        aria-expanded={pastOpen}
                        aria-controls="past-sits-list"
                        onClick={() => setPastOpen((o) => !o)}
                        className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left"
                      >
                        <span className="t-eyebrow text-[var(--mute)]">Past sits ({pastSits.length})</span>
                        <ChevronDown className={`size-4 text-[var(--mute)] transition-transform ${pastOpen ? "rotate-180" : ""}`} />
                      </button>
                      {pastOpen && (
                        <div id="past-sits-list" className="mt-1 space-y-2">
                          {pastSits.map((s) => (
                            <PastSitCard
                              key={s.id}
                              sit={s as ListSit}
                              caregiverName={caregiverName(s)}
                              leadName={hasHousehold ? leadFirstName(s) : null}
                              scans={0}
                              flagged={0}
                            />
                          ))}
                        </div>
                      )}
                    </section>
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
