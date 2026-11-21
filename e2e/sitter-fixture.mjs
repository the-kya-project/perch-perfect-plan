// Seed data for the sitter-view tests (e2e/sitter-tour.spec.ts), served by
// mock-supabase.mjs as if it were the database. Two sits:
//
//   e2e-sitter-long-care   Kiwi: every care-sheet section filled in at length,
//                          so the later tour steps start well below the fold,
//                          a photo that loads late, and a full day of tasks.
//   e2e-sitter-no-tasks    Mango: a short care sheet and no routine tasks, so
//                          the Today screen has no daily checklist and the
//                          tour has to skip that step.
//
// Nothing here is real: made-up ids, names and numbers.

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const day = 86_400_000;
const iso = (ms) => new Date(ms).toISOString();
const date = (ms) => iso(ms).slice(0, 10);

const long = (topic) =>
  `${topic}. ` +
  "Kiwi does best with a calm, predictable routine. Speak softly when you come into the room, " +
  "move slowly near the cage, and give a minute to settle before offering a hand. " +
  "If anything looks different from what's written here, write it down and let me know.";

export function sitterFixture(mockOrigin) {
  const now = Date.now();
  const photo = `${mockOrigin}/__photo.png?delay=1500`;

  const birds = [
    {
      id: "00000000-0000-4000-8000-0000000000b1", owner_id: OWNER, name: "Kiwi", species: "african_grey", sex: "female",
      photo_url: photo, photo_position: "50% 20%", passed_at: null, created_at: iso(now - 400 * day),
      normal_weight: 450, normal_weight_min: 430, normal_weight_max: 470,
      medical_conditions: long("Conditions"), medications: long("Medications"),
    },
    {
      id: "00000000-0000-4000-8000-0000000000b2", owner_id: OWNER, name: "Mango", species: "sun_conure", sex: "male",
      photo_url: null, photo_position: null, passed_at: null, created_at: iso(now - 300 * day),
      normal_weight: 110, normal_weight_min: null, normal_weight_max: null, medical_conditions: null, medications: null,
    },
  ];

  const care_plans = [
    {
      id: "00000000-0000-4000-8000-0000000000c1", bird_id: birds[0].id,
      diet_types: ["pellets", "fresh"], food_brand: "Harrison's High Potency Fine", amount_value: 2, amount_unit: "tbsp",
      feeding_times: ["morning", "evening"], fresh_foods: ["kale", "carrot", "pepper", "broccoli"], fresh_foods_other: long("Other fresh food"),
      treats_notes: long("Treats"), treats_frequency: "daily", water_frequency: "twice_daily", water_notes: long("Water"),
      food_storage: long("Storage"), food_hygiene_notes: long("Hygiene"), food_instructions: long("Feeding"), water_instructions: long("Water bowl"),
      fresh_food_removal_minutes: 120,
      step_up: "yes", step_up_notes: long("Stepping up"), handlers: ["owner", "sitter"], likes: long("Likes"),
      fears_triggers: long("Fears"), bite_risk: "low", handling_rules: long("Handling"), known_triggers: long("Triggers"),
      cage_location: long("Cage"), out_of_cage_mode: "supervised", out_of_cage_notes: long("Out of cage"), out_of_cage_rules: long("Rules"),
      hazards: ["ceiling_fan", "open_windows", "nonstick_pans"], hazards_other: long("Other hazards"), off_limits: long("Off limits"),
      off_limits_rooms: long("Rooms"), safety_rules: long("Safety"), other_pets: long("Other pets"), cleaning_instructions: long("Cleaning"),
      whats_normal: long("Normal"), normal_appetite: long("Appetite"), normal_droppings: long("Droppings"), normal_noise: long("Noise"),
      normal_activity: long("Activity"), normal_sleep: long("Sleep"), normal_behavior_with_strangers: long("Strangers"),
      medication_schedule: long("Medication schedule"),
      when_to_call_owner: long("Call me"), when_to_call_vet: long("Call the vet"),
    },
    {
      id: "00000000-0000-4000-8000-0000000000c2", bird_id: birds[1].id,
      diet_types: ["pellets"], food_brand: "Zupreem", feeding_times: ["morning"],
      when_to_call_owner: "Anything unusual.", when_to_call_vet: "Not eating for a day.",
    },
  ];

  const routine_tasks = ["morning", "morning", "midday", "evening", "evening", "evening"].map((category, i) => ({
    id: `00000000-0000-4000-8000-0000000000d${i}`, care_plan_id: care_plans[0].id, category, sort_order: i,
    title: ["Fresh water", "Morning pellets", "Out-of-cage time", "Evening veggies", "Cover the cage", "Lights out"][i],
    instructions: long("Task"), time_of_day: null, required: true, sitter_completable: true, guide_card_id: null, derived: null,
  }));

  const sit = (id, token, birdId) => ({
    sit: {
      id, owner_id: OWNER, sitter_name: "Sam", sitter_email: null, caregiver_user_id: null, title: null, notes: null,
      start_date: date(now - day), end_date: date(now + 3 * day), status: "active", revoked: false,
      invite_token: token, token_expires_at: iso(now + 10 * day), created_at: iso(now - 2 * day), time_zone: "Europe/Amsterdam",
    },
    link: { sit_id: id, bird_id: birdId, reminders_paused_at: null },
  });
  const a = sit("00000000-0000-4000-8000-0000000000e1", "e2e-sitter-long-care", birds[0].id);
  const b = sit("00000000-0000-4000-8000-0000000000e2", "e2e-sitter-no-tasks", birds[1].id);

  const guide_cards = ["Feeding", "Health", "Behavior", "Safety", "Emergency"].flatMap((category, i) =>
    [1, 2].map((k) => ({
      id: `00000000-0000-4000-8000-0000000000f${i}${k}`, slug: `${category.toLowerCase()}-${k}`, title: `${category} ${k}`, category: category.toLowerCase(),
      quick_answer: long(category), what_to_check: null, what_to_do: null, when_to_call_vet: null, emergency_level: "normal",
      search_keywords: category.toLowerCase(), reviewed_by: null, reviewed_at: null, created_at: iso(now - 100 * day),
    })),
  );

  return {
    tables: {
      sits: [a.sit, b.sit],
      sit_birds: [a.link, b.link],
      sitter_previews: [],
      birds,
      care_plans,
      routine_tasks,
      emergency_contacts: birds.map((bd) => ({ bird_id: bd.id, owner_phone: "+31 6 1234 5678", avian_vet_name: "Dierenkliniek De Vogel", avian_vet_phone: "+31 20 123 4567", avian_vet_address: "Vogelstraat 1, Amsterdam" })),
      owner_emergency_defaults: [],
      owner_home_defaults: [],
      task_completions: [],
      daily_logs: [],
      photo_logs: [],
      profiles: [{ id: OWNER, display_name: "Alex Owner", first_name: "Alex", full_name: "Alex Owner", email: "owner@example.com" }],
      guide_cards,
    },
    users: { [OWNER]: { id: OWNER, email: "owner@example.com", user_metadata: { display_name: "Alex Owner" } } },
  };
}
