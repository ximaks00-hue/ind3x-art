import { beforeEach, describe, expect, it } from "vitest";

import {
  readViewerPreferencesFromSettings,
  setViewerLightingPreset,
  setViewerShowGrid,
  syncViewerPreferencesFromSettings,
  toggleViewerShowGrid,
} from "./viewerPreferencesSync";
import { useSettingsStore } from "./settingsStore";
import { useViewerStore } from "./viewerStore";

describe("viewerPreferencesSync", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      viewerLightingPreset: "ingame",
      viewerShowGrid: false,
      viewerShowVignette: false,
      viewerShowDevOverlay: true,
    });
    useViewerStore.setState({
      lightingPreset: "studio",
      showGrid: true,
      showVignette: true,
      showDevOverlay: false,
    });
  });

  it("syncs persisted settings into viewer store on bootstrap", () => {
    syncViewerPreferencesFromSettings();

    const viewer = useViewerStore.getState();
    expect(viewer.lightingPreset).toBe("ingame");
    expect(viewer.showGrid).toBe(false);
    expect(viewer.showVignette).toBe(false);
    expect(viewer.showDevOverlay).toBe(true);
  });

  it("updates both stores when viewer preferences change", () => {
    setViewerLightingPreset("flat");
    setViewerShowGrid(true);

    expect(readViewerPreferencesFromSettings()).toEqual({
      lightingPreset: "flat",
      showGrid: true,
      showVignette: false,
      showDevOverlay: true,
    });
    expect(useViewerStore.getState().lightingPreset).toBe("flat");
    expect(useViewerStore.getState().showGrid).toBe(true);
  });

  it("toggle keeps settings and viewer in sync", () => {
    syncViewerPreferencesFromSettings();
    toggleViewerShowGrid();

    expect(useSettingsStore.getState().viewerShowGrid).toBe(true);
    expect(useViewerStore.getState().showGrid).toBe(true);
  });
});
