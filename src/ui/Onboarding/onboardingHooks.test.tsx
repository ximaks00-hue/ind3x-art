import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { OnboardingTour } from "./OnboardingTour";
import { TooltipHints } from "./TooltipHints";

describe("onboarding hooks regression", () => {
  beforeEach(() => {
    useProjectStore.setState({ handle: null } as Partial<ReturnType<typeof useProjectStore.getState>>);
    useSettingsStore.setState({
      onboardingCompleted: false,
      onboardingTourStep: 0,
      studioOnboardingCompleted: false,
      studioInAppOnboardingCompleted: false,
      studioInAppOnboardingTourStep: 0,
      workspaceMode: "studio",
      sessionCount: 1,
      dismissedHints: [],
    });
  });

  it("OnboardingTour survives project open mid-tour without crashing", () => {
    const { rerender } = render(<OnboardingTour />);
    useProjectStore.setState({ handle: { id: 42 }, indexStatus: "done" } as Partial<
      ReturnType<typeof useProjectStore.getState>
    >);
    expect(() => rerender(<OnboardingTour />)).not.toThrow();
  });

  it("TooltipHints survives project open mid-session without crashing", () => {
    const { rerender } = render(<TooltipHints />);
    useProjectStore.setState({ handle: { id: 42 }, indexStatus: "done" } as Partial<
      ReturnType<typeof useProjectStore.getState>
    >);
    expect(() => rerender(<TooltipHints />)).not.toThrow();
  });
});
