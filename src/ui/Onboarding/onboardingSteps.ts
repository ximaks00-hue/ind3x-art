import type { IndexStatus } from "../../state/projectStore";
import type { WorkspaceMode } from "../../state/settingsStore";

export interface OnboardingStep {
  title: string;
  body: string;
  target: string;
}

export const CLASSIC_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Open a project",
    body: "Classic mode supports mod JAR and resource folders. Open a source or try the bundled demo pack.",
    target: "tour-open",
  },
  {
    title: "Select a texture",
    body: "Pick any texture in the explorer — block models and blockstates work too.",
    target: "tour-explorer",
  },
  {
    title: "Paint a face",
    body: "Press Space for Paint mode, click a face in the 3D viewer, then edit in the texture panel.",
    target: "tour-viewer",
  },
  {
    title: "Save your work",
    body: "Press Ctrl+S or use Save in the title bar. Backups are created automatically.",
    target: "tour-save",
  },
];

export const STUDIO_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Creative catalog",
    body: "Studio mode is JAR-only. Browse blocks like Minecraft's creative inventory with fast keyboard search.",
    target: "tour-catalog",
  },
  {
    title: "Pick a block",
    body: "Click any icon — the 3D view opens in Paint mode on the top face.",
    target: "tour-studio-viewport",
  },
  {
    title: "Paint a face",
    body: "Click faces in 3D or use texture chips below. The editor on the right follows your selection.",
    target: "tour-editor",
  },
  {
    title: "Save",
    body: "Ctrl+S saves your changes. Every save creates a backup you can restore later.",
    target: "tour-save",
  },
];

export const STUDIO_IN_APP_ONBOARDING_STEPS: OnboardingStep[] = STUDIO_ONBOARDING_STEPS.slice(1);

/** Onboarding dims the whole window — hide it while a pack is open or loading. */
export function shouldShowOnboardingTour(opts: {
  workspaceMode: WorkspaceMode;
  studioOnboardingCompleted: boolean;
  onboardingCompleted: boolean;
  hasOpenProject: boolean;
  opening: boolean;
  indexStatus: IndexStatus;
}): boolean {
  if (opts.hasOpenProject || opts.opening || opts.indexStatus === "running") {
    return false;
  }
  return opts.workspaceMode === "studio"
    ? !opts.studioOnboardingCompleted
    : !opts.onboardingCompleted;
}

/** Post-open Studio tour — viewport, editor, save — after catalog is ready. */
export function shouldShowStudioInAppOnboarding(opts: {
  workspaceMode: WorkspaceMode;
  studioInAppOnboardingCompleted: boolean;
  hasOpenProject: boolean;
  indexStatus: IndexStatus;
}): boolean {
  if (opts.workspaceMode !== "studio") return false;
  if (!opts.hasOpenProject || opts.indexStatus !== "done") return false;
  return !opts.studioInAppOnboardingCompleted;
}
