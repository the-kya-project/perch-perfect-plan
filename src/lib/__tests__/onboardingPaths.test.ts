import { describe, it, expect } from "vitest";
import { postAddBirdDestination, incompleteBirdCareCta } from "../onboardingPaths";

describe("quickstart routing decisions", () => {
  it("quickstart on: add-bird lands on Home, incomplete bird fronts the profile", () => {
    expect(postAddBirdDestination(true)).toBe("home");
    expect(incompleteBirdCareCta(true)).toBe("plan");
  });

  it("flag off: legacy production flow — straight into the wizard", () => {
    expect(postAddBirdDestination(false)).toBe("wizard");
    expect(incompleteBirdCareCta(false)).toBe("wizard");
  });
});
