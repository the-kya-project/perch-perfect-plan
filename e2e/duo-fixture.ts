// Made-up data for the iPhone Duo screenshots (e2e/duo.screens.ts): one owner
// with four birds, Echo's weights and checks. Nothing here is a real account.
// Rows are what PostgREST would return; the screenshot test answers the app's
// Supabase requests from these, in the browser, so no server is involved.

export const OWNER_ID = "00000000-0000-4000-8000-0000000000a1";
export const ECHO_ID = "00000000-0000-4000-8000-0000000000b1";

const DAY = 86_400_000;

/** `appOrigin`: where the app is served (bird photos come from /public). */
export function duoFixture(appOrigin: string, now = Date.now()) {
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const date = (msAgo: number) => iso(msAgo).slice(0, 10);
  const bird = (n: number, name: string, species: string, sex: string, photo: string) => ({
    id: `00000000-0000-4000-8000-0000000000b${n}`,
    owner_id: OWNER_ID,
    name,
    species,
    sex,
    age: null,
    birth_date: date(2 * 365 * DAY + n * 40 * DAY),
    flight_status: "flighted",
    photo_url: `${appOrigin}${photo}`,
    photo_position: "50% 30%",
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

  return {
    user: {
      id: OWNER_ID, aud: "authenticated", role: "authenticated", email: "duo-owner@example.com",
      email_confirmed_at: iso(200 * DAY), created_at: iso(200 * DAY), app_metadata: { provider: "email" },
      user_metadata: { first_name: "Brittany" }, identities: [],
    },
    tables: <Record<string, Record<string, any>[]>>{
      birds,
      weight_entries: weights,
      daily_logs: checks,
      bird_members: birds.map((b) => ({ bird_id: b.id, user_id: OWNER_ID, role: "owner" })),
      profiles: [{
        id: OWNER_ID, first_name: "Brittany", display_name: "Brittany", locale: "en",
        welcome_seen_at: iso(150 * DAY), created_at: iso(200 * DAY), time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }],
    },
    rpc: { flock_enabled: true } as Record<string, unknown>,
  };
}
