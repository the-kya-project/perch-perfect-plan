import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { namesAsCount } from "@/lib/birdNames";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getLocalUser } from "@/integrations/supabase/currentUser";
import { Plus, Calendar, CalendarPlus } from "lucide-react";
import { ActiveSitCard, UpcomingSitCard, PastSitsList, type SitBird, type ListSit } from "@/components/SitListCards";
import { rangeTo } from "@/lib/sitText";
import { K, KyaPage, KyaBody, KyaCard, KyaHeading, KyaPrimaryButton } from "@/components/kya";
import { TabHeader } from "@/components/headers";
import { useServerFn } from "@tanstack/react-start";
import { resolveHouseholdNames, resolveOwnerNames } from "@/lib/home.functions";
import { memberDisplayName } from "@/lib/memberDisplay";
import { useBirdPhotos } from "@/lib/useBirdPhotos";
import { fetchBirdList } from "@/lib/birdListSelect";
import { weekdayMonthDay, daysUntil } from "@/lib/dates";
import { localDateISO } from "@/lib/localDay";
import { useTranslation } from "react-i18next";
import i18next from "i18next";

// Dedicated Sits tab: create / manage sits. Shares the ["birds"] cache with the
// dashboard via fetchBirdList (identical query/shape, so neither poisons the other).
// Its OWN ["sits-full"] key holds the full sit rows (+ sit_birds join) it needs —
// separate from the dashboard's minimal ["all-sits"] so the two shapes don't
// collide. Sit mutations invalidate both. Past sits (end_date < today) render
// inline in a collapsible section from this same ["sits-full"] data — no route.
const sitsSearch = z.object({
  // Old links into the inline form: now forwarded to /sits/new.
  newSit: z.coerce.boolean().optional(),
  preselectBirdId: z.string().uuid().optional(),
  // A sit just created: its card goes first.
  created: z.string().uuid().optional(),
});

export const Route = createFileRoute("/_authenticated/sits/")({
  head: () => ({ meta: [{ title: i18next.t("sits.pageTitle", "Sits — Kya & Co.") }] }),
  validateSearch: sitsSearch,
  component: SitsPage,
});

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  // More than three birds: a count instead of names (see src/lib/birdNames.ts).
  if (namesAsCount(names)) return i18next.t("birdNames.count", "{{count}} birds", { count: names.length });
  if (names.length === 1) return names[0];
  if (names.length === 2) return i18next.t("sits.joinTwo", "{{a}} and {{b}}", { a: names[0], b: names[1] });
  return i18next.t("sits.joinMany", "{{list}}, and {{last}}", { list: names.slice(0, -1).join(", "), last: names[names.length - 1] });
}

function SitsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { newSit, preselectBirdId, created } = Route.useSearch();
  // Setting up a sit is its own screen now; forward old ?newSit links there.
  useEffect(() => {
    if (newSit) navigate({ to: "/sits/new", search: preselectBirdId ? { bird: preselectBirdId } : {}, replace: true });
  }, [newSit, preselectBirdId, navigate]);

  const { data: birds = [] } = useQuery({
    queryKey: ["birds"],
    queryFn: async () => {
      // Identical to the dashboard's fetch (fetchBirdList) so the shared ["birds"]
      // cache always has ONE shape. Active flock only; Sits ignores the embedded
      // weight_entries the dashboard reads, but must fetch the same rows anyway.
      const { data, error } = await fetchBirdList();
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

  const today = localDateISO();
  const allSits = sits as any[];

  // State buckets. Active = underway today (most-recently-started first).
  // Upcoming = strictly future. Past = ended (end_date < today) — shown inline in
  // a collapsible section below, most-recently-ended first (no separate route).
  const actives = allSits
    .filter((s) => s.start_date <= today && s.end_date >= today)
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const upcoming = allSits
    .filter((s) => s.start_date > today)
    .sort((a, b) => (a.id === created ? -1 : b.id === created ? 1 : a.start_date.localeCompare(b.start_date)));
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
  const caregiverName = (s: any): string =>
    s.caregiver_user_id ? displayFor(s.caregiver_user_id) : (s.sitter_name?.trim() || t("sits.yourSitter", "Your sitter"));

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
        : { kind: "household", ownerName: s.owner_id in ownerNames ? ((ownerNames as Record<string, string | null>)[s.owner_id] || t("sits.anOwner", "An owner")) : null };
  // "You're in charge" only when the current user is the one COVERING the sit
  // (the covering caregiver), never merely because they own the birds.
  const iAmLead = (s: any): boolean => !!myId && s.caregiver_user_id === myId;

  // Bird photos are stored as bucket PATHS; resolve them to signed URLs (small
  // transform — the chips are tiny dots) so the chip <img> actually loads.
  const resolvePhoto = useBirdPhotos(birds.map((b: any) => b.photo_url), 800);
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

  // ---- Adaptive header copy -------------------------------------------------
  let heroHeadline = t("sits.heroGoingAway", "Going away?");
  let heroBody = t("sits.heroGoingAwayBody", "For when you can't be there — set up a sit and share what they need to know.");
  if (actives.length > 0) {
    const a = actives[0];
    heroHeadline = t("sits.heroSittingNowNoDot", "{{name}} is sitting now", { name: caregiverName(a) });
    heroBody = t("sits.heroThrough", "Through {{date}}.", { date: weekdayMonthDay(a.end_date) });
  } else if (upcoming.length > 0) {
    const n = [...upcoming].sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
    const d = daysUntil(n.start_date);
    heroHeadline =
      d <= 0
        ? t("sits.heroArrivesTodayNoDot", "{{name}} arrives today", { name: caregiverName(n) })
        : d === 1
          ? t("sits.heroArrivesTomorrowNoDot", "{{name}} arrives tomorrow", { name: caregiverName(n) })
          : t("sits.heroArrivesInDaysNoDot", "{{name}} arrives in {{count}} days", { name: caregiverName(n), count: d });
    const names = birdsFor(n).map((b) => b.name);
    heroBody = [n.title?.trim() || null, rangeTo(t, n.start_date, n.end_date), names.length ? joinNames(names) : null].filter(Boolean).join(" · ");
  }

  const noSits = actives.length === 0 && upcoming.length === 0;

  return (
    <KyaPage>
      <div className="mx-auto max-w-md">
        <TabHeader title={heroHeadline} line={heroBody}></TabHeader>

        <KyaBody className="gap-5">
          {birds.length === 0 ? (
            <KyaCard className="p-6 text-center">
              <div className="flex justify-center">
                <span className="grid size-12 place-items-center rounded-[14px]" style={{ background: K.mist, color: K.moss }}><Calendar className="size-6" /></span>
              </div>
              <KyaHeading size={21} className="mt-3">{t("sits.addBirdFirst", "Add a bird first")}</KyaHeading>
              <p className="m-0 mx-auto mt-1.5 max-w-[34ch] text-[15px] leading-[1.5]" style={{ color: K.ink }}>
                {t("sits.addBirdFirstBody", "A sit shares one or more birds' care plans with a sitter. Add a bird to create your first sit.")}
              </p>
              <div className="mt-4"><KyaPrimaryButton onClick={() => navigate({ to: "/birds/new" })} icon={<Plus className="size-5" />}>{t("sits.addBird", "Add bird")}</KyaPrimaryButton></div>
            </KyaCard>
          ) : sitsLoading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => <div key={i} className="h-28 animate-pulse rounded-[20px] bg-white" />)}
            </div>
          ) : (
            <>
              {actives.map((s) => (
                <ActiveSitCard
                  key={s.id}
                  sit={s as ListSit}
                  birds={birdsFor(s)}
                  caregiverName={caregiverName(s)}
                  iAmLead={iAmLead(s)}
                  iOwnSit={s.owner_id === myId}
                  contextTag={contextTagFor(s)}
                  canEdit={s.owner_id === myId}
                />
              ))}

              {upcoming.length > 0 && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-baseline justify-between gap-3 px-1">
                    <KyaHeading size={23}>{t("sits.comingUp", "Coming up")}</KyaHeading>
                    <span className="text-[14px]" style={{ color: K.quiet }}>{t("sits.sitCount", "{{count}} sits", { count: upcoming.length })}</span>
                  </div>
                  {upcoming.map((s) => (
                    <UpcomingSitCard
                      key={s.id}
                      sit={s as ListSit}
                      birds={birdsFor(s)}
                      caregiverName={caregiverName(s)}
                      iAmLead={iAmLead(s)}
                      iOwnSit={s.owner_id === myId}
                      contextTag={contextTagFor(s)}
                      canEdit={s.owner_id === myId}
                    />
                  ))}
                </section>
              )}

              {noSits && (
                <KyaCard className="p-6 text-center">
                  <div className="flex justify-center">
                    <span className="grid size-12 place-items-center rounded-[14px]" style={{ background: K.forest, color: K.lime }}><CalendarPlus className="size-6" /></span>
                  </div>
                  <KyaHeading size={21} className="mt-3">{t("sits.noSits", "No sits scheduled.")}</KyaHeading>
                  <p className="m-0 mx-auto mt-1.5 max-w-[34ch] text-[15px] leading-[1.5]" style={{ color: K.ink }}>
                    {t("sits.noSitsBody", "A sit shares today's routine, a daily health check, and one-tap emergency contacts with whoever's covering.")}
                  </p>
                </KyaCard>
              )}

              {canManageSits ? (
                noSits ? (
                  <KyaPrimaryButton onClick={() => navigate({ to: "/sits/new" })}>{t("sits.setUpSit", "Set up a sit")}</KyaPrimaryButton>
                ) : (
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/sits/new" })}
                    className="flex min-h-[52px] w-full items-center justify-center gap-1.5 rounded-full border-2 border-dashed text-[15px] font-[700]"
                    style={{ borderColor: "#9fb3a3", color: K.forest }}
                  >
                    <Plus className="size-4" /> {upcoming.length > 0 ? t("sits.setUpAnother", "Set up another sit") : t("sits.setUpSit", "Set up a sit")}
                  </button>
                )
              ) : (
                // Household members can view sits they're covering, but only a
                // bird's owner can set one up.
                <p className="m-0 px-1 text-center text-[13px]" style={{ color: K.quiet }}>{t("sits.onlyOwner", "Only a bird's owner can set up a sit.")}</p>
              )}

              {pastSits.length > 0 && (
                <section className="flex flex-col gap-3">
                  <KyaHeading size={21} className="px-1">{t("sits.pastSitsHeading", "Past sits")}</KyaHeading>
                  <PastSitsList sits={pastSits as ListSit[]} caregiverName={(s) => caregiverName(s)} />
                </section>
              )}
            </>
          )}
        </KyaBody>
      </div>
    </KyaPage>
  );
}
