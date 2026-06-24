import { beforeEach, describe, expect, it } from "vitest";

import { THEME_ORDER, useSettingsStore } from "./settingsStore";

describe("settingsStore layout & theme", () => {
  beforeEach(() => {
    localStorage.clear();
    useSettingsStore.setState({
      theme: "dark",
      focusMode: false,
      leftPanelCollapsed: false,
      rightPanelCollapsed: false,
      editorPanelWidth: 300,
    });
  });

  it("cycles themes in order", () => {
    expect(useSettingsStore.getState().theme).toBe("dark");
    useSettingsStore.getState().cycleTheme();
    expect(useSettingsStore.getState().theme).toBe("light");
    useSettingsStore.getState().cycleTheme();
    expect(useSettingsStore.getState().theme).toBe("high-contrast");
    useSettingsStore.getState().cycleTheme();
    expect(useSettingsStore.getState().theme).toBe("dark");
    expect(THEME_ORDER).toEqual(["dark", "light", "high-contrast"]);
  });

  it("enables focus mode and collapses explorer", () => {
    useSettingsStore.getState().toggleFocusMode();
    const state = useSettingsStore.getState();
    expect(state.focusMode).toBe(true);
    expect(state.leftPanelCollapsed).toBe(true);
  });

  it("clamps editor panel width", () => {
    useSettingsStore.getState().setEditorPanelWidth(100);
    expect(useSettingsStore.getState().editorPanelWidth).toBe(240);
    useSettingsStore.getState().setEditorPanelWidth(900);
    expect(useSettingsStore.getState().editorPanelWidth).toBe(560);
  });
});
