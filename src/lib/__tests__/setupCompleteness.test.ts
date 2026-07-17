import { describe, it, expect } from "vitest";
import { computeSetupCompleteness, shouldMarkSetupComplete } from "../setupCompleteness";

// A care_plans row with every section filled (matches the per-section rules).
const FULL_PLAN = {
  diet_types: ["pellets"],
  handlers: "Just me",
  cage_location: "Living room",
  whats_normal: "Chatty in the morning",
  clip_step_up_path: "cfstream:abc123",
};
const FULL_CONTACTS = { owner_phone: "555-0100", avian_vet_phone: "555-0200" };

describe("computeSetupCompleteness", () => {
  it("zero-state bird (name + species only, no care rows) is 0/7 and valid", () => {
    const c = computeSetupCompleteness({ bird: { species: "Cockatiel" }, plan: null, tasksCount: 0, contacts: null, defaults: null });
    expect(c.total).toBe(7);
    expect(c.doneCount).toBe(0);
    expect(c.pct).toBe(0);
    expect(c.checks.every((x) => !x.done)).toBe(true);
    expect(c.firstIncompleteStep).toBe(1);
  });

  it("partial bird marks exactly the filled sections done", () => {
    const c = computeSetupCompleteness({
      bird: { species: "Cockatiel", normal_weight: 92 },
      plan: { diet_types: ["pellets"] },
      tasksCount: 0,
      contacts: null,
      defaults: null,
    });
    const byKey = new Map(c.checks.map((x) => [x.key, x.done]));
    expect(byKey.get("food")).toBe(true);
    expect(byKey.get("health")).toBe(true); // normal_weight counts
    expect(byKey.get("personality")).toBe(false);
    expect(byKey.get("day")).toBe(false);
    expect(c.doneCount).toBe(2);
  });

  it("fully filled bird is 7/7", () => {
    const c = computeSetupCompleteness({
      bird: { species: "Cockatiel", normal_weight: 92 },
      plan: FULL_PLAN,
      tasksCount: 3,
      contacts: FULL_CONTACTS,
      defaults: null,
    });
    expect(c.doneCount).toBe(7);
    expect(c.pct).toBe(100);
    expect(c.firstIncompleteStep).toBeNull();
  });

  it("emergency falls back to account defaults (foster/minimal bird case)", () => {
    const c = computeSetupCompleteness({
      bird: { species: null },
      plan: null,
      tasksCount: 0,
      contacts: { owner_phone: "" },
      defaults: FULL_CONTACTS,
    });
    expect(c.checks.find((x) => x.key === "emergency")?.done).toBe(true);
  });

  it("a foster bird's completeness follows the same rules (no special-casing)", () => {
    const foster = { species: "Green-cheek conure", is_foster: true } as any;
    const zero = computeSetupCompleteness({ bird: foster, plan: null, tasksCount: 0, contacts: null, defaults: null });
    expect(zero.doneCount).toBe(0);
    const full = computeSetupCompleteness({ bird: { ...foster, normal_weight: 65 }, plan: FULL_PLAN, tasksCount: 1, contacts: FULL_CONTACTS, defaults: null });
    expect(full.doneCount).toBe(7);
  });
});

describe("shouldMarkSetupComplete (self-serve setup_complete write)", () => {
  it("all 7 filled via self-serve → flag should be set true", () => {
    expect(shouldMarkSetupComplete({ setupComplete: false, doneCount: 7, total: 7 })).toBe(true);
    expect(shouldMarkSetupComplete({ setupComplete: null, doneCount: 7, total: 7 })).toBe(true);
  });

  it("partial bird stays false", () => {
    expect(shouldMarkSetupComplete({ setupComplete: false, doneCount: 6, total: 7 })).toBe(false);
    expect(shouldMarkSetupComplete({ setupComplete: false, doneCount: 0, total: 7 })).toBe(false);
  });

  it("already-complete bird is never re-written (and can never regress)", () => {
    expect(shouldMarkSetupComplete({ setupComplete: true, doneCount: 7, total: 7 })).toBe(false);
    expect(shouldMarkSetupComplete({ setupComplete: true, doneCount: 0, total: 7 })).toBe(false);
  });
});
