// Made-up data for the iPhone Duo screenshots (e2e/duo.screens.ts): one owner
// with four birds, Echo's weights and checks. Nothing here is a real account.
// Rows are what PostgREST would return; the screenshot test answers the app's
// Supabase requests from these, in the browser, so no server is involved.

// @ts-expect-error plain JS fixture
import { sitterFixture } from "./sitter-fixture.mjs";

export const OWNER_ID = "00000000-0000-4000-8000-0000000000a1";
export const ECHO_ID = "00000000-0000-4000-8000-000000000db1";

const DAY = 86_400_000;

/** `appOrigin`: where the app is served (bird photos come from /public). */
/**
 * `variant` (the screen inventory, e2e/duo.inventory.ts):
 *   base     — what screens:duo has always used: four birds, Echo's weights and checks.
 *   filled   — base plus sits (active, upcoming, past), journal, moments,
 *              a household member and invite, past birds, photos, updates.
 *   empty    — the birds, with nothing logged: no weights, checks, sits,
 *              journal, moments, household or past birds.
 *   nobirds  — an account with no birds yet (Home's empty state).
 *   new      — nobirds, and the one-time welcome not seen yet.
 *   readiness — filled, plus Buzz with a care plan missing its food, and an
 *              avian vet with no phone number: Set up a sit's "Ready for …?"
 *              check then shows Fix rows.
 */
export type DuoVariant = "base" | "filled" | "empty" | "nobirds" | "new" | "readiness";
export const MEMBER_ID = "00000000-0000-4000-8000-0000000000a2";
export const SIT_ACTIVE_ID = "00000000-0000-4000-8000-0000000000f1";
export const SIT_UPCOMING_ID = "00000000-0000-4000-8000-0000000000f2";
export const SIT_PAST_ID = "00000000-0000-4000-8000-0000000000f3";

export function duoFixture(appOrigin: string, now = Date.now(), variant: DuoVariant = "base") {
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const date = (msAgo: number) => iso(msAgo).slice(0, 10);
  const bird = (n: number, name: string, species: string, sex: string, photo: string) => ({
    id: `00000000-0000-4000-8000-000000000db${n}`,
    owner_id: OWNER_ID,
    name,
    species,
    sex,
    age: null,
    birth_date: date(2 * 365 * DAY + n * 40 * DAY),
    flight_status: "flighted",
    photo_url: `${appOrigin}${photo}`,
    // No saved crop, as for most birds: the app's default framing applies
    // (lib/birdPhotoFocus.ts).
    photo_position: null,
    setup_complete: true,
    setup_step: null,
    is_foster: false,
    intake_date: null,
    became_permanent_on: null,
    passed_at: null,
    created_at: iso(200 * DAY),
  });
  const birds = [
    bird(1, "Echo", "Red-crowned Amazon", "Male", "/brand/email/juno.jpg"),
    bird(2, "Buzz", "African Grey (Timneh)", "Male", "/brand/email/weighing.jpg"),
    bird(3, "Willow", "Blue and Gold Macaw", "Female", "/brand/email/journal-foraging.jpg"),
    bird(4, "Max", "Blue-throated Macaw", "Male", "/brand/email/health-check.jpg"),
  ];

  // Echo: 28 weigh-ins over ~90 days, latest yesterday morning before a meal.
  const echoGrams = [296, 298, 295, 297, 299, 294, 296, 298, 297, 295, 293, 296, 298, 300, 297, 296, 295, 297, 298, 296, 299, 297, 295, 296, 298, 297, 295, 297];
  const weights: Record<string, any>[] = [];
  echoGrams.forEach((g, i) => {
    const daysBack = 1 + Math.round(((echoGrams.length - 1 - i) * 86) / (echoGrams.length - 1));
    const at = new Date(now - daysBack * DAY);
    at.setHours(8, 31, 0, 0);
    weights.push({
      id: `00000000-0000-4000-8000-0000000c${String(i).padStart(4, "0")}`,
      bird_id: birds[0].id, grams: g, measured_at: at.toISOString(), source: "owner",
      meal_relation: "before_meal", logged_by: OWNER_ID, sit_id: null, created_at: at.toISOString(),
    });
  });
  ([[1, 305], [2, 1056], [3, 803]] as const).forEach(([b, g], i) => {
    const at = new Date(now - DAY);
    at.setHours(8, 40 + i, 0, 0);
    weights.push({
      id: `00000000-0000-4000-8000-0000000d000${i}`, bird_id: birds[b].id, grams: g, measured_at: at.toISOString(),
      source: "owner", meal_relation: "before_meal", logged_by: OWNER_ID, sit_id: null, created_at: at.toISOString(),
    });
  });

  // Newest first, as the app's queries order them.
  weights.sort((a, b) => (a.measured_at < b.measured_at ? 1 : -1));

  const checks = [1, 4, 8].map((d, i) => ({
    id: `00000000-0000-4000-8000-0000000e000${i}`, bird_id: birds[0].id, log_date: date(d * DAY), created_at: iso(d * DAY),
    triage_status: "green", source: "owner", run_by: OWNER_ID, sit_id: null, kind: i === 1 ? "full" : "daily", item_notes: null,
  }));

  const readiness = variant === "readiness";
  const filled = variant === "filled" || readiness;
  const sit = (id: string, title: string, startDays: number, endDays: number, sitter: string, birdIds: string[]) => ({
    row: {
      id, owner_id: OWNER_ID, title, sitter_name: sitter, sitter_email: `${sitter.toLowerCase()}@example.com`,
      start_date: date(-startDays * DAY), end_date: date(-endDays * DAY), status: "ready", revoked: false,
      invite_token: `duo-${id.slice(-4)}`, token_expires_at: iso(-(endDays + 1) * DAY), created_at: iso(30 * DAY),
      caregiver_user_id: null, lead_user_id: null, marked_ready_at: iso(20 * DAY), notes: null, time_zone: "Europe/Amsterdam",
    },
    birds: birdIds.map((b) => ({ sit_id: id, bird_id: b, created_at: iso(30 * DAY), reminders_paused_at: null })),
  });
  const sits = filled ? [
    sit(SIT_ACTIVE_ID, "Weekend away", -1, 2, "Sam", [birds[0].id, birds[1].id]),
    sit(SIT_UPCOMING_ID, "Christmas trip", 40, 47, "Noor", birds.map((b) => b.id)),
    sit(SIT_PAST_ID, "Summer holiday", -120, -110, "Sam", [birds[0].id]),
  ] : [];
  const journal = filled ? [
    { id: "00000000-0000-4000-8000-00000000c101", bird_id: birds[0].id, kind: "vet", title: "Annual check-up", body: "All clear. Weight steady, beak and nails good.", occurred_on: date(12 * DAY), created_at: iso(12 * DAY), logged_by: OWNER_ID, photo_path: null, sit_id: null },
    { id: "00000000-0000-4000-8000-00000000c102", bird_id: birds[0].id, kind: "molt", title: "Molting", body: "Lots of pin feathers on the head.", occurred_on: date(30 * DAY), created_at: iso(30 * DAY), logged_by: OWNER_ID, photo_path: null, sit_id: null },
    { id: "00000000-0000-4000-8000-00000000c103", bird_id: birds[0].id, kind: "note", title: "New perch", body: "Took to the rope perch straight away.", occurred_on: date(45 * DAY), created_at: iso(45 * DAY), logged_by: OWNER_ID, photo_path: null, sit_id: null },
  ] : [];
  const moments = filled ? [
    { id: "00000000-0000-4000-8000-00000000d101", bird_id: birds[0].id, kind: "custom", title: "First words", on_date: date(200 * DAY), recurs: true, auto_generated: false, photo_path: null, created_at: iso(200 * DAY) },
  ] : [];
  const keep = variant === "nobirds" || variant === "new" ? [] : birds;
  // Echo's care plan: a copy of the sitter fixture's complete one (filled only).
  const sitterTables = (sitterFixture(appOrigin) as { tables: Record<string, Record<string, any>[]> }).tables;
  const ECHO_PLAN = "00000000-0000-4000-8000-0000000000c9";
  const carePlans: Record<string, any>[] = filled ? [{ ...sitterTables.care_plans[0], id: ECHO_PLAN, bird_id: birds[0].id }] : [];
  const routineTasks = filled
    ? sitterTables.routine_tasks.filter((t) => t.care_plan_id === sitterTables.care_plans[0].id).map((t, i) => ({ ...t, id: `00000000-0000-4000-8000-0000000c90${String(i).padStart(2, "0")}`, care_plan_id: ECHO_PLAN }))
    : [];
  // readiness: Buzz has the same plan with the food section left empty.
  const BUZZ_PLAN = "00000000-0000-4000-8000-0000000000ca";
  if (readiness) {
    carePlans.push({ ...sitterTables.care_plans[0], id: BUZZ_PLAN, bird_id: birds[1].id, diet_types: [], food_instructions: null, diet_details: null });
    routineTasks.push(...routineTasks.map((t, i) => ({ ...t, id: `00000000-0000-4000-8000-0000000ca0${String(i).padStart(2, "0")}`, care_plan_id: BUZZ_PLAN })));
  }
  const withLogs = variant === "base" || filled;
  const members = [
    ...keep.map((b) => ({ bird_id: b.id, user_id: OWNER_ID, role: "owner" })),
    ...(filled ? [{ bird_id: birds[0].id, user_id: MEMBER_ID, role: "household", created_at: iso(60 * DAY) }, { bird_id: birds[1].id, user_id: MEMBER_ID, role: "household", created_at: iso(60 * DAY) }] : []),
  ];

  return {
    user: {
      id: OWNER_ID, aud: "authenticated", role: "authenticated", email: "duo-owner@example.com",
      email_confirmed_at: iso(200 * DAY), created_at: iso(200 * DAY), app_metadata: { provider: "email" },
      user_metadata: { first_name: "Brittany" }, identities: [],
    },
    tables: <Record<string, Record<string, any>[]>>{
      birds: keep,
      weight_entries: withLogs ? weights : [],
      daily_logs: withLogs ? checks : [],
      bird_members: members,
      sits: sits.map((x) => x.row),
      sit_birds: sits.flatMap((x) => x.birds),
      journal_entries: journal,
      moments,
      household_member_permissions: [],
      household_invites: filled ? [{ id: "00000000-0000-4000-8000-00000000e101", owner_id: OWNER_ID, invitee_email: "jules@example.com", invitee_name: "Jules", bird_ids: [birds[0].id], preset: "helper", status: "pending", token: "duo-invite", created_at: iso(2 * DAY), expires_at: iso(-12 * DAY), accepted_user_id: null }] : [],
      past_birds: filled ? [{ id: "00000000-0000-4000-8000-00000000f101", original_owner_id: OWNER_ID, bird_name: "Kiwi", species: "Budgerigar", mode: "handoff", recipient_name: "Ana", departed_on: date(300 * DAY), created_at: iso(300 * DAY), intake_date: null, intake_date_source: null, photo_thumb: null, was_foster: true }] : [],
      notification_log: filled ? [{ id: "00000000-0000-4000-8000-00000000a101", user_id: OWNER_ID, bird_id: birds[0].id, type: "sit_log", channel: "push", ref_id: checks[0]?.id ?? null, sent_at: iso(DAY) }] : [],
      care_plans: carePlans,
      routine_tasks: routineTasks,
      emergency_contacts: [],
      owner_emergency_defaults: [readiness
        // An avian vet with no phone number yet: the emergency row needs fixing.
        ? { owner_id: OWNER_ID, owner_phone: "+31 6 5550 0123", avian_vet_name: "Bird & Exotic Clinic", avian_vet_phone: null, emergency_vet_name: "Night Vet", emergency_vet_phone: "+31 20 555 0199" }
        : { owner_id: OWNER_ID, vet_name: "Bird & Exotic Clinic", vet_phone: "+31 20 555 0101", emergency_vet_name: "Night Vet", emergency_vet_phone: "+31 20 555 0199" }],
      gift_purchases: [],
      profiles: [{
        id: OWNER_ID, first_name: "Brittany", display_name: "Brittany", locale: "en",
        welcome_seen_at: variant === "new" ? null : iso(150 * DAY), created_at: iso(200 * DAY), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }, ...(filled ? [{ id: MEMBER_ID, first_name: "Sam", display_name: "Sam", locale: "en", welcome_seen_at: iso(100 * DAY), created_at: iso(100 * DAY) }] : [])],
    },
    rpc: { flock_enabled: true, is_admin: true, admin_founding_claims: [], founding_status: { claimed: 12, total: 50 } } as Record<string, unknown>,
  };
}
