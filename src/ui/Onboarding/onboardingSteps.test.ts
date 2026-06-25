import { describe, expect, it } from "vitest";

import { CLASSIC_ONBOARDING_STEPS, STUDIO_IN_APP_ONBOARDING_STEPS, STUDIO_ONBOARDING_STEPS, shouldShowOnboardingTour, shouldShowStudioInAppOnboarding } from "./onboardingSteps";

describe("onboardingSteps", () => {
  it("defines classic tour with explorer flow", () => {
    expect(CLASSIC_ONBOARDING_STEPS).toHaveLength(4);
    expect(CLASSIC_ONBOARDING_STEPS[1]?.target).toBe("tour-explorer");
  });

  it("defines studio tour covering catalog through save", () => {
    expect(STUDIO_ONBOARDING_STEPS).toHaveLength(4);
    const targets = STUDIO_ONBOARDING_STEPS.map((s) => s.target);
    expect(targets).toContain("tour-catalog");
    expect(targets).toContain("tour-studio-viewport");
    expect(targets).toContain("tour-save");
  });

  it("hides tour while a project is open or loading", () => {
    expect(
      shouldShowOnboardingTour({
        workspaceMode: "studio",
        studioOnboardingCompleted: false,
        onboardingCompleted: false,
        hasOpenProject: true,
        opening: false,
        indexStatus: "done",
      }),
    ).toBe(false);
    expect(
      shouldShowOnboardingTour({
        workspaceMode: "studio",
        studioOnboardingCompleted: false,
        onboardingCompleted: false,
        hasOpenProject: false,
        opening: true,
        indexStatus: "idle",
      }),
    ).toBe(false);
    expect(
      shouldShowOnboardingTour({
        workspaceMode: "studio",
        studioOnboardingCompleted: false,
        onboardingCompleted: false,
        hasOpenProject: false,
        opening: false,
        indexStatus: "running",
      }),
    ).toBe(false);
    expect(
      shouldShowOnboardingTour({
        workspaceMode: "studio",
        studioOnboardingCompleted: false,
        onboardingCompleted: false,
        hasOpenProject: false,
        opening: false,
        indexStatus: "idle",
      }),
    ).toBe(true);
  });

  it("defines studio in-app tour for open workspace", () => {
    expect(STUDIO_IN_APP_ONBOARDING_STEPS).toHaveLength(3);
    expect(STUDIO_IN_APP_ONBOARDING_STEPS[0]?.target).toBe("tour-studio-viewport");
  });

  it("shows in-app studio tour after pack is indexed", () => {
    expect(
      shouldShowStudioInAppOnboarding({
        workspaceMode: "studio",
        studioInAppOnboardingCompleted: false,
        hasOpenProject: true,
        indexStatus: "done",
      }),
    ).toBe(true);
    expect(
      shouldShowStudioInAppOnboarding({
        workspaceMode: "studio",
        studioInAppOnboardingCompleted: true,
        hasOpenProject: true,
        indexStatus: "done",
      }),
    ).toBe(false);
  });
});
