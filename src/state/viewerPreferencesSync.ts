import type { LightingPreset } from "../lib/lightingPresets";
import { useSettingsStore } from "./settingsStore";
import { useViewerStore } from "./viewerStore";

export interface ViewerPreferences {
  lightingPreset: LightingPreset;
  showGrid: boolean;
  showVignette: boolean;
  showDevOverlay: boolean;
}

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

function commitViewerPreferences(prefs: ViewerPreferences): void {
  const settings = useSettingsStore.getState();
  settings.setViewerLightingPreset(prefs.lightingPreset);
  settings.setViewerShowGrid(prefs.showGrid);
  settings.setViewerShowVignette(prefs.showVignette);
  settings.setViewerShowDevOverlay(prefs.showDevOverlay);
  applyViewerPreferencesToViewerStore(prefs);
}

export function setViewerLightingPreset(preset: LightingPreset): void {
  commitViewerPreferences({
    ...readViewerPreferencesFromSettings(),
    lightingPreset: preset,
  });
}

export function setViewerShowGrid(show: boolean): void {
  commitViewerPreferences({
    ...readViewerPreferencesFromSettings(),
    showGrid: show,
  });
}

export function setViewerShowVignette(show: boolean): void {
  commitViewerPreferences({
    ...readViewerPreferencesFromSettings(),
    showVignette: show,
  });
}

export function setViewerShowDevOverlay(show: boolean): void {
  commitViewerPreferences({
    ...readViewerPreferencesFromSettings(),
    showDevOverlay: show,
  });
}

export function toggleViewerShowGrid(): void {
  const { showGrid } = readViewerPreferencesFromSettings();
  setViewerShowGrid(!showGrid);
}

export function toggleViewerShowVignette(): void {
  const { showVignette } = readViewerPreferencesFromSettings();
  setViewerShowVignette(!showVignette);
}
