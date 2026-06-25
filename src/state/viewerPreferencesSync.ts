import type { LightingPreset } from "../lib/lightingPresets";
import { useSettingsStore } from "./settingsStore";
import { useViewerStore } from "./viewerStore";

export interface ViewerPreferences {
  lightingPreset: LightingPreset;
  showGrid: boolean;
  showVignette: boolean;
  showDevOverlay: boolean;
}

/** Persisted settings are the source of truth; viewerStore mirrors runtime state for 3D. */
export function readViewerPreferencesFromSettings(): ViewerPreferences {
  const settings = useSettingsStore.getState();
  return {
    lightingPreset: settings.viewerLightingPreset,
    showGrid: settings.viewerShowGrid,
    showVignette: settings.viewerShowVignette,
    showDevOverlay: settings.viewerShowDevOverlay,
  };
}

export function applyViewerPreferencesToViewerStore(
  prefs: ViewerPreferences = readViewerPreferencesFromSettings(),
): void {
  const viewer = useViewerStore.getState();
  viewer.setLightingPreset(prefs.lightingPreset);
  viewer.setShowGrid(prefs.showGrid);
  viewer.setShowVignette(prefs.showVignette);
  viewer.setShowDevOverlay(prefs.showDevOverlay);
}

/** Push persisted settings into the runtime viewer store (call on bootstrap). */
export function syncViewerPreferencesFromSettings(): void {
  applyViewerPreferencesToViewerStore();
}

/** Read persisted viewer display prefs — single source of truth for UI. */
export function useViewerLightingPreset() {
  return useSettingsStore((s) => s.viewerLightingPreset);
}

export function useViewerShowGrid() {
  return useSettingsStore((s) => s.viewerShowGrid);
}

export function useViewerShowVignette() {
  return useSettingsStore((s) => s.viewerShowVignette);
}

export function useViewerShowDevOverlay() {
  return useSettingsStore((s) => s.viewerShowDevOverlay);
}

function commitViewerPreferences(patch: Partial<ViewerPreferences>): void {
  useSettingsStore.setState((state) => {
    const next: ViewerPreferences = {
      lightingPreset: patch.lightingPreset ?? state.viewerLightingPreset,
      showGrid: patch.showGrid ?? state.viewerShowGrid,
      showVignette: patch.showVignette ?? state.viewerShowVignette,
      showDevOverlay: patch.showDevOverlay ?? state.viewerShowDevOverlay,
    };
    applyViewerPreferencesToViewerStore(next);
    return {
      viewerLightingPreset: next.lightingPreset,
      viewerShowGrid: next.showGrid,
      viewerShowVignette: next.showVignette,
      viewerShowDevOverlay: next.showDevOverlay,
    };
  });
}

export function setViewerLightingPreset(preset: LightingPreset): void {
  commitViewerPreferences({ lightingPreset: preset });
}

export function setViewerShowGrid(show: boolean): void {
  commitViewerPreferences({ showGrid: show });
}

export function setViewerShowVignette(show: boolean): void {
  commitViewerPreferences({ showVignette: show });
}

export function setViewerShowDevOverlay(show: boolean): void {
  commitViewerPreferences({ showDevOverlay: show });
}

export function toggleViewerShowGrid(): void {
  useSettingsStore.setState((state) => {
    const showGrid = !state.viewerShowGrid;
    const next: ViewerPreferences = {
      lightingPreset: state.viewerLightingPreset,
      showGrid,
      showVignette: state.viewerShowVignette,
      showDevOverlay: state.viewerShowDevOverlay,
    };
    applyViewerPreferencesToViewerStore(next);
    return { viewerShowGrid: showGrid };
  });
}

export function toggleViewerShowVignette(): void {
  useSettingsStore.setState((state) => {
    const showVignette = !state.viewerShowVignette;
    const next: ViewerPreferences = {
      lightingPreset: state.viewerLightingPreset,
      showGrid: state.viewerShowGrid,
      showVignette,
      showDevOverlay: state.viewerShowDevOverlay,
    };
    applyViewerPreferencesToViewerStore(next);
    return { viewerShowVignette: showVignette };
  });
}
