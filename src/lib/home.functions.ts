// Owner Home overview data that needs server-side resolution (auth emails /
// profile names / cross-bird aggregation). Stale weigh-ins, upcoming sits, and
// upcoming Moments are computed client-side from data the Home already loads;
// this fn covers only the household summary + recent household activity, which
// require the admin client to resolve actor names across every bird the owner
// has. Read-only. No writes, no notifications.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function getAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const ACTIVITY_WINDOW_MS = 48 * 60 * 60 * 1000;

export type HomeHouseholdMember = { userId: string; name: string | null };
export type HomeHouseholdActivity = {
  id: string;
  kind: "weight" | "journal" | "scan";
  birdName: string;
  actorName: string;
  at: string;
  summary: string;
};
export type HomeHousehold = {
  members: HomeHouseholdMember[];
  // "all" when every household member is on every one of the owner's birds
  // (the common case — invites default to all birds); otherwise the distinct
  // birds that have any household member, for the "Sharing X and Y" line.
  scope: "all" | "scoped";
  sharedBirdNames: string[];
  activity: HomeHouseholdActivity[];
};

export const getHouseholdHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HomeHousehold> => {
    const sb = await getAdmin();
    const ownerId = context.userId as string;
    const empty: HomeHousehold = { members: [], scope: "all", sharedBirdNames: [], activity: [] };

    // The owner's birds.
    const { data: birds } = await sb.from("birds").select("id, name").eq("owner_id", ownerId);
    const birdRows = (birds ?? []) as { id: string; name: string }[];
    if (!birdRows.length) return empty;
    const birdIds = birdRows.map((b) => b.id);
    const nameByBird = new Map(birdRows.map((b) => [b.id, b.name]));

    // Household memberships across all of those birds.
    const { data: memberRows } = await sb
      .from("bird_members")
      .select("user_id, bird_id, role")
      .in("bird_id", birdIds)
      .eq("role", "household")
      // Never list the owner as a household member of her OWN household — if her
      // id is self-recorded in bird_members it must not render as "You and <self>".
      .neq("user_id", ownerId);
    const rows = (memberRows ?? []) as { user_id: string; bird_id: string }[];
    if (!rows.length) return empty;

    const memberIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const birdsByMember = new Map<string, Set<string>>();
    const membersByBird = new Map<string, Set<string>>();
    for (const r of rows) {
      (birdsByMember.get(r.user_id) ?? birdsByMember.set(r.user_id, new Set()).get(r.user_id)!).add(r.bird_id);
      (membersByBird.get(r.bird_id) ?? membersByBird.set(r.bird_id, new Set()).get(r.bird_id)!).add(r.user_id);
    }

    // Resolve member display names.
    const nameByUser = new Map<string, string>();
    const { data: profs } = await sb.from("profiles").select("id, display_name").in("id", memberIds);
    for (const p of (profs ?? []) as any[]) nameByUser.set(p.id, (p.display_name ?? "").toString().trim());
    await Promise.all(
      memberIds.map(async (id) => {
        if (nameByUser.get(id)) return;
        try {
          const { data: u } = await sb.auth.admin.getUserById(id);
          nameByUser.set(id, u?.user?.user_metadata?.display_name?.toString().trim() || u?.user?.email?.split("@")[0] || "");
        } catch { /* ignore */ }
      }),
    );
    const displayName = (id: string) => nameByUser.get(id)?.trim() || "Someone";

    const members: HomeHouseholdMember[] = memberIds.map((id) => ({ userId: id, name: nameByUser.get(id)?.trim() || null }));

    // Scope: are all members on all birds?
    const everyMemberOnEveryBird = memberIds.every((id) => (birdsByMember.get(id)?.size ?? 0) === birdIds.length);
    const sharedBirdIds = Array.from(membersByBird.keys());
    const scope: "all" | "scoped" = everyMemberOnEveryBird ? "all" : "scoped";
    const sharedBirdNames = sharedBirdIds.map((id) => nameByBird.get(id)!).filter(Boolean);

    // Recent household activity (last 48h): household weights, household scans,
    // and journal entries authored by a household member.
    const sinceISO = new Date(Date.now() - ACTIVITY_WINDOW_MS).toISOString();
    const memberSet = new Set(memberIds);
    const activity: HomeHouseholdActivity[] = [];

    const [weightsRes, scansRes, journalRes] = await Promise.all([
      sb.from("weight_entries").select("id, bird_id, grams, measured_at, source, logged_by")
        .in("bird_id", birdIds).eq("source", "household").gte("measured_at", sinceISO)
        .order("measured_at", { ascending: false }).limit(8),
      sb.from("daily_logs").select("id, bird_id, triage_status, created_at, source, run_by")
        .in("bird_id", birdIds).eq("source", "household").gte("created_at", sinceISO)
        .order("created_at", { ascending: false }).limit(8),
      sb.from("journal_entries").select("id, bird_id, title, created_at, logged_by")
        .in("bird_id", birdIds).gte("created_at", sinceISO)
        .order("created_at", { ascending: false }).limit(12),
    ]);

    for (const w of (weightsRes.data ?? []) as any[]) {
      activity.push({
        id: `w-${w.id}`, kind: "weight", birdName: nameByBird.get(w.bird_id) ?? "A bird",
        actorName: displayName(w.logged_by), at: w.measured_at, summary: `logged ${w.grams} g`,
      });
    }
    for (const s of (scansRes.data ?? []) as any[]) {
      activity.push({
        id: `s-${s.id}`, kind: "scan", birdName: nameByBird.get(s.bird_id) ?? "A bird",
        actorName: displayName(s.run_by), at: s.created_at, summary: "ran a health scan",
      });
    }
    for (const j of (journalRes.data ?? []) as any[]) {
      if (!j.logged_by || !memberSet.has(j.logged_by)) continue; // owner's own entries aren't "household"
      activity.push({
        id: `j-${j.id}`, kind: "journal", birdName: nameByBird.get(j.bird_id) ?? "A bird",
        actorName: displayName(j.logged_by), at: j.created_at,
        summary: j.title ? `added a journal note — ${j.title}` : "added a journal note",
      });
    }

    activity.sort((a, b) => +new Date(b.at) - +new Date(a.at));

    return { members, scope, sharedBirdNames, activity: activity.slice(0, 4) };
  });

// Resolve household member user_ids -> { name, email } via the service role.
// The authenticated client can't read other users' profiles (profiles RLS is
// self-only), so name-display surfaces (sit cover picker, sit card/detail
// "in charge"/caregiver) must resolve through here. Scoped for safety: only
// returns names for the caller themselves + members of birds the caller owns,
// so it can't be used to look up arbitrary users.
export type ResolvedName = { name: string | null; email: string | null };
export const resolveHouseholdNames = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userIds: string[] }) =>
    z.object({ userIds: z.array(z.string().uuid()).max(200) }).parse(d),
  )
  .handler(async ({ data, context }): Promise<Record<string, ResolvedName>> => {
    const sb = await getAdmin();
    const ownerId = (context as any).userId as string;
    const want = Array.from(new Set((data.userIds ?? []).filter(Boolean)));
    if (!want.length) return {};

    // Allowed = the caller + everyone who is a member of a bird the caller owns.
    const allowed = new Set<string>([ownerId]);
    const { data: ownedBirds } = await sb.from("birds").select("id").eq("owner_id", ownerId);
    const birdIds = (ownedBirds ?? []).map((b: any) => b.id);
    if (birdIds.length) {
      const { data: mem } = await sb.from("bird_members").select("user_id").in("bird_id", birdIds);
      for (const m of (mem ?? []) as any[]) allowed.add(m.user_id);
    }
    const ids = want.filter((id) => allowed.has(id));
    if (!ids.length) return {};

    const { data: profs } = await sb.from("profiles").select("id, display_name, email").in("id", ids);
    const out: Record<string, ResolvedName> = {};
    for (const p of (profs ?? []) as any[]) {
      out[p.id] = {
        name: (p.display_name ?? "").toString().trim() || null,
        email: (p.email ?? "").toString().trim() || null,
      };
    }
    return out;
  });

// ---- Consolidated owner-Home above-the-fold payload (single round trip) -----
// Replaces the dashboard's separate profile-name + birds + weights + sits loads
// with ONE server fn. Data is read through the USER-SCOPED (RLS) client so owner
// AND member access is enforced exactly as before; only caregiver display names
// use the admin client (profiles RLS is self-only). Secondary panels (full
// household roster, past birds) stay lazy on the client.
const DASHBOARD_BIRD_SELECT =
  "id, owner_id, name, species, photo_url, photo_position, is_foster, intake_date, birth_date, acquired_on, became_permanent_on, created_at";

export type DashboardSit = {
  id: string;
  sitter_name: string | null;
  caregiver_user_id: string | null;
  caregiverName: string | null;
  start_date: string;
};
export type DashboardHome = {
  profile: { displayName: string };
  birds: any[];
  weights: { bird_id: string; grams: number; measured_at: string }[];
  sits: DashboardSit[];
};

export const getDashboardHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardHome> => {
    const sb = (context as any).supabase; // RLS-enforced (owner + member access)
    const uid = (context as any).userId as string;

    const [profileRes, birdsRes, sitsRes] = await Promise.all([
      sb.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
      sb.from("birds").select(DASHBOARD_BIRD_SELECT).order("created_at", { ascending: false }),
      sb.from("sits").select("id, sitter_name, caregiver_user_id, start_date")
        .or("sitter_name.is.null,sitter_name.neq.__preview__").order("start_date", { ascending: false }),
    ]);

    const birds = (birdsRes.data ?? []) as any[];
    const birdIds = birds.map((b) => b.id);

    let weights: DashboardHome["weights"] = [];
    if (birdIds.length) {
      const { data } = await sb.from("weight_entries").select("bird_id, grams, measured_at")
        .in("bird_id", birdIds).order("measured_at", { ascending: false }).limit(600);
      weights = (data ?? []) as DashboardHome["weights"];
    }

    // Caregiver display names (admin — profiles RLS is self-only). The sits are
    // already RLS-scoped to the caller, so their caregivers are the caller's own
    // household members; resolving their names here is safe.
    const sitsRaw = (sitsRes.data ?? []) as any[];
    const caregiverIds = Array.from(new Set(sitsRaw.map((s) => s.caregiver_user_id).filter(Boolean))) as string[];
    const nameById = new Map<string, string>();
    if (caregiverIds.length) {
      const admin = await getAdmin();
      const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", caregiverIds);
      for (const p of (profs ?? []) as any[]) nameById.set(p.id, (p.display_name ?? "").toString().trim());
      await Promise.all(caregiverIds.map(async (id) => {
        if (nameById.get(id)) return;
        try {
          const { data: u } = await admin.auth.admin.getUserById(id);
          nameById.set(id, u?.user?.user_metadata?.display_name?.toString().trim() || u?.user?.email?.split("@")[0] || "");
        } catch { /* ignore */ }
      }));
    }
    const sits: DashboardSit[] = sitsRaw.map((s) => ({
      id: s.id,
      sitter_name: s.sitter_name ?? null,
      caregiver_user_id: s.caregiver_user_id ?? null,
      start_date: s.start_date,
      caregiverName: s.caregiver_user_id ? (nameById.get(s.caregiver_user_id) || null) : null,
    }));

    return { profile: { displayName: (profileRes.data?.display_name ?? "").toString() }, birds, weights, sits };
  });
