import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "high-contrast";

export const THEME_ORDER: Theme[] = ["dark", "light", "high-contrast"];

export interface RecentProject {
  path: string;
  kind: "jar" | "folder";
  openedAt: number;
}

interface SettingsState {
  theme: Theme;
  recentProjects: RecentProject[];
  textureCacheLimit: number;
  modelCacheLimit: number;
  uiScale: number;
  explorerPanelWidth: number;
  editorPanelWidth: number;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  focusMode: boolean;
  viewerLightingPreset: import("../lib/lightingPresets").LightingPreset;
  viewerShowGrid: boolean;
  viewerShowVignette: boolean;
  viewerShowDevOverlay: boolean;
  pinnedAssetIds: string[];
  recentAssetIds: string[];
  onboardingCompleted: boolean;
  onboardingTourStep: number;
  sessionCount: number;
  dismissedHints: string[];
  lastSessionPath: string | null;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
  toggleTheme: () => void;
  addRecentProject: (path: string, kind: "jar" | "folder") => void;
  clearRecentProjects: () => void;
  setTextureCacheLimit: (n: number) => void;
  setModelCacheLimit: (n: number) => void;
  setUiScale: (scale: number) => void;
  setExplorerPanelWidth: (width: number) => void;
  setEditorPanelWidth: (width: number) => void;
  setLeftPanelCollapsed: (collapsed: boolean) => void;
  setRightPanelCollapsed: (collapsed: boolean) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setFocusMode: (enabled: boolean) => void;
  toggleFocusMode: () => void;
  setViewerLightingPreset: (
    preset: import("../lib/lightingPresets").LightingPreset,
  ) => void;
  setViewerShowGrid: (show: boolean) => void;
  setViewerShowVignette: (show: boolean) => void;
  setViewerShowDevOverlay: (show: boolean) => void;
  togglePinnedAsset: (assetId: string) => void;
  pushRecentAsset: (assetId: string) => void;
  clearRecentAssets: () => void;
  completeOnboarding: () => void;
  setOnboardingTourStep: (step: number) => void;
  incrementSessionCount: () => void;
  dismissHint: (hintId: string) => void;
  setLastSessionPath: (path: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      recentProjects: [],
      textureCacheLimit: 512,
      modelCacheLimit: 256,
      uiScale: 1,
      explorerPanelWidth: 300,
      editorPanelWidth: 300,
      leftPanelCollapsed: false,
      rightPanelCollapsed: false,
      focusMode: false,
      viewerLightingPreset: "studio",
      viewerShowGrid: true,
      viewerShowVignette: true,
      viewerShowDevOverlay: false,
      pinnedAssetIds: [],
      recentAssetIds: [],
      onboardingCompleted: false,
      onboardingTourStep: 0,
      sessionCount: 0,
      dismissedHints: [],
      lastSessionPath: null,
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const idx = THEME_ORDER.indexOf(get().theme);
        const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length] ?? "dark";
        set({ theme: next });
      },
      toggleTheme: () => {
        const idx = THEME_ORDER.indexOf(get().theme);
        const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length] ?? "dark";
        set({ theme: next });
      },
      addRecentProject: (path, kind) => {
        const next = [
          { path, kind, openedAt: Date.now() },
          ...get().recentProjects.filter((p) => p.path !== path),
        ].slice(0, 8);
        set({ recentProjects: next });
      },
      clearRecentProjects: () => set({ recentProjects: [] }),
      setTextureCacheLimit: (textureCacheLimit) => set({ textureCacheLimit }),
      setModelCacheLimit: (modelCacheLimit) => set({ modelCacheLimit }),
      setUiScale: (uiScale) => set({ uiScale: Math.max(0.8, Math.min(1.5, uiScale)) }),
      setExplorerPanelWidth: (explorerPanelWidth) =>
        set({ explorerPanelWidth: Math.max(220, Math.min(520, explorerPanelWidth)) }),
      setEditorPanelWidth: (editorPanelWidth) =>
        set({ editorPanelWidth: Math.max(240, Math.min(560, editorPanelWidth)) }),
      setLeftPanelCollapsed: (leftPanelCollapsed) => set({ leftPanelCollapsed }),
      setRightPanelCollapsed: (rightPanelCollapsed) => set({ rightPanelCollapsed }),
      toggleLeftPanel: () => set({ leftPanelCollapsed: !get().leftPanelCollapsed }),
      toggleRightPanel: () => set({ rightPanelCollapsed: !get().rightPanelCollapsed }),
      setFocusMode: (focusMode) =>
        set(
          focusMode
            ? { focusMode: true, leftPanelCollapsed: true }
            : { focusMode: false },
        ),
      toggleFocusMode: () => {
        const next = !get().focusMode;
        set(next ? { focusMode: true, leftPanelCollapsed: true } : { focusMode: false });
      },
      setViewerLightingPreset: (viewerLightingPreset) => set({ viewerLightingPreset }),
      setViewerShowGrid: (viewerShowGrid) => set({ viewerShowGrid }),
      setViewerShowVignette: (viewerShowVignette) => set({ viewerShowVignette }),
      setViewerShowDevOverlay: (viewerShowDevOverlay) => set({ viewerShowDevOverlay }),
      togglePinnedAsset: (assetId) => {
        const pinned = get().pinnedAssetIds;
        const next = pinned.includes(assetId)
          ? pinned.filter((id) => id !== assetId)
          : [assetId, ...pinned].slice(0, 64);
        set({ pinnedAssetIds: next });
      },
      pushRecentAsset: (assetId) => {
        const next = [
          assetId,
          ...get().recentAssetIds.filter((id) => id !== assetId),
        ].slice(0, 20);
        set({ recentAssetIds: next });
      },
      clearRecentAssets: () => set({ recentAssetIds: [] }),
      completeOnboarding: () => set({ onboardingCompleted: true, onboardingTourStep: 0 }),
      setOnboardingTourStep: (onboardingTourStep) => set({ onboardingTourStep }),
      incrementSessionCount: () => set({ sessionCount: get().sessionCount + 1 }),
      dismissHint: (hintId) => {
        const dismissed = get().dismissedHints;
        if (dismissed.includes(hintId)) return;
        set({ dismissedHints: [...dismissed, hintId] });
      },
      setLastSessionPath: (lastSessionPath) => set({ lastSessionPath }),
    }),
    {
      name: "ind3x-art-settings",
      partialize: (state) => ({
        theme: state.theme,
        recentProjects: state.recentProjects,
        textureCacheLimit: state.textureCacheLimit,
        modelCacheLimit: state.modelCacheLimit,
        uiScale: state.uiScale,
        explorerPanelWidth: state.explorerPanelWidth,
        editorPanelWidth: state.editorPanelWidth,
        leftPanelCollapsed: state.leftPanelCollapsed,
        rightPanelCollapsed: state.rightPanelCollapsed,
        focusMode: state.focusMode,
        viewerLightingPreset: state.viewerLightingPreset,
        viewerShowGrid: state.viewerShowGrid,
        viewerShowVignette: state.viewerShowVignette,
        viewerShowDevOverlay: state.viewerShowDevOverlay,
        pinnedAssetIds: state.pinnedAssetIds,
        recentAssetIds: state.recentAssetIds,
        onboardingCompleted: state.onboardingCompleted,
        onboardingTourStep: state.onboardingTourStep,
        sessionCount: state.sessionCount,
        dismissedHints: state.dismissedHints,
        lastSessionPath: state.lastSessionPath,
      }),
    },
  ),
);
