import { useCallback } from "react";

import {
  classicEnterFromStudio,
  studioEnterPatch,
} from "../features/catalog/workspaceTransition";
import {
  useSettingsStore,
  type WorkspaceMode,
} from "../state/settingsStore";

/** Apply workspace transition side effects and persist mode (orchestration lives outside the store). */
export function transitionToWorkspaceMode(next: WorkspaceMode): void {
  const state = useSettingsStore.getState();
  const prev = state.workspaceMode;
  if (prev === next) return;

  if (next === "classic" && prev === "studio") {
    classicEnterFromStudio();
  }

  const enteringStudio = next === "studio" && prev !== "studio";
  const studioPatch = enteringStudio ? studioEnterPatch() : {};
  const onboardingPatch =
    enteringStudio && !state.studioOnboardingCompleted
      ? { studioOnboardingTourStep: 0 as const }
      : {};

  useSettingsStore.setState({
    workspaceMode: next,
    ...studioPatch,
    ...onboardingPatch,
  });
}

export function toggleWorkspaceMode(): void {
  const prev = useSettingsStore.getState().workspaceMode;
  transitionToWorkspaceMode(prev === "classic" ? "studio" : "classic");
}

export function useWorkspaceMode() {
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);

  const setWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    transitionToWorkspaceMode(mode);
  }, []);

  const toggle = useCallback(() => {
    toggleWorkspaceMode();
  }, []);

  return { workspaceMode, setWorkspaceMode, toggleWorkspaceMode: toggle };
}
