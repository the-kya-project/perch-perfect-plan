// Tour demo mode — while the owner walkthrough runs, Home renders fixed example
// content so every bubble has something concrete to point at, regardless of the
// user's real (often empty) data. Purely presentational: nothing is written to
// the database; the real queries still run but the dashboard ignores their
// results while demo mode is on, and returns to real data the instant it ends.
import { useSyncExternalStore } from "react";
import { monthDay } from "@/lib/dates";
import type { HomeBird, WeightGlance, TodayItem } from "@/lib/homeData";
import type { HomeHousehold } from "@/lib/home.functions";

let demo = false;
const listeners = new Set<() => void>();

export function setTourDemo(on: boolean) {
  if (demo === on) return;
  demo = on;
  listeners.forEach((l) => l());
}
export function useTourDemo(): boolean {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => demo,
    () => false,
  );
}

// ---- Fixtures (locked content) --------------------------------------------
function bird(partial: Partial<HomeBird> & { id: string; name: string }): HomeBird {
  return {
    species: null, photo_url: null, photo_position: null, is_foster: false,
    intake_date: null, birth_date: null, acquired_on: null, became_permanent_on: null,
    ...partial,
  };
}

export const DEMO_FLOCK: HomeBird[] = [
  bird({ id: "demo-buzz", name: "Buzz", species: "African Grey (Timneh)" }),
  bird({ id: "demo-willow", name: "Willow", species: "Blue and Gold Macaw" }),
];

export const DEMO_FOSTERS: HomeBird[] = [
  bird({ id: "demo-mango", name: "Mango", species: "Blue and Gold Macaw", is_foster: true, intake_date: "2026-05-12" }),
];

const DEMO_GLANCE: Record<string, WeightGlance> = {
  "demo-buzz": { state: "trend", current: 396, pill: { tone: "good", label: "Up 360 g" } },
  "demo-willow": { state: "trend", current: 1075, pill: { tone: "good", label: "Steady" } },
  "demo-mango": { state: "trend", current: 980, pill: { tone: "good", label: "Steady" } },
};
export function demoGlanceFor(birdId: string): WeightGlance {
  return DEMO_GLANCE[birdId] ?? { state: "none" };
}

// "tomorrow" is computed at call time so the Today panel reads correctly on the
// day the tour runs.
export function getDemoToday(): TodayItem[] {
  const t = new Date();
  const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1).toISOString().slice(0, 10);
  return [
    { id: "demo-sit", tone: "pale", title: "Sam arrives tomorrow", meta: `Sit starts ${monthDay(tomorrow)}`, to: { kind: "sits" }, rank: 0 },
    { id: "demo-hatch", tone: "amber", title: "Willow's hatch day Saturday", meta: "She'll be 14", to: { kind: "moments", birdId: "demo-willow" }, rank: 1 },
  ];
}

export const DEMO_HOUSEHOLD: HomeHousehold = {
  members: [{ userId: "demo-adam", name: "Adam" }],
  scope: "all",
  sharedBirdNames: ["Buzz", "Willow"],
  activity: [],
};
