import { describe, expect, it } from "vitest";

import { CLASSIC_ONBOARDING_STEPS, STUDIO_ONBOARDING_STEPS } from "./onboardingSteps";

describe("onboardingSteps", () => {
  it("defines classic tour with explorer flow", () => {
    expect(CLASSIC_ONBOARDING_STEPS).toHaveLength(4);
    expect(CLASSIC_ONBOARDING_STEPS[1]?.target).toBe("tour-explorer");
  });

  it("defines studio tour covering catalog through save", () => {
    expect(STUDIO_ONBOARDING_STEPS.length).toBeGreaterThanOrEqual(5);
    const targets = STUDIO_ONBOARDING_STEPS.map((s) => s.target);
    expect(targets).toContain("tour-catalog");
    expect(targets).toContain("tour-studio-viewport");
    expect(targets).toContain("tour-texture-nav");
    expect(targets).toContain("tour-save");
  });
});
