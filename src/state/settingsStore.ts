import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { CatalogCategory } from "../ipc/types";
import {
  clampModelCacheLimit,
  clampTextureCacheLimit,
} from "./cacheLimits";

export type Theme = "dark" | "light" | "high-contrast";
export type WorkspaceMode = "classic" | "studio";
export type CatalogIconMode = "auto" | "preview" | "3d";

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
  workspaceMode: WorkspaceMode;
  catalogIconMode: CatalogIconMode;
  catalogIconCacheLimit: number;
  catalogShowCellLabels: boolean;
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
  pinnedCatalogIds: string[];
  recentCatalogIds: string[];
  studioShowFloorGrid: boolean;
  onboardingCompleted: boolean;
  onboardingTourStep: number;
  studioOnboardingCompleted: boolean;
  studioOnboardingTourStep: number;
  studioInAppOnboardingCompleted: boolean;
  studioInAppOnboardingTourStep: number;
  sessionCount: number;
  dismissedHints: string[];
  lastSessionPath: string | null;
  studioSelectedCatalogId: string | null;
  studioCatalogCategory: CatalogCategory | null;
  catalogLanguage: string;
  miniSceneEnabled: boolean;
  miniSceneSize: 2 | 3;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
  toggleTheme: () => void;
  addRecentProject: (path: string, kind: "jar" | "folder") => void;
  clearRecentProjects: () => void;
  setTextureCacheLimit: (n: number) => void;
  setModelCacheLimit: (n: number) => void;
  setUiScale: (scale: number) => void;
  setCatalogIconMode: (mode: CatalogIconMode) => void;
  setCatalogIconCacheLimit: (n: number) => void;
  setCatalogShowCellLabels: (show: boolean) => void;
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
  togglePinnedCatalogId: (catalogId: string) => void;
  pushRecentCatalogId: (catalogId: string) => void;
  setStudioShowFloorGrid: (show: boolean) => void;
  completeOnboarding: () => void;
  setOnboardingTourStep: (step: number) => void;
  completeStudioOnboarding: () => void;
  setStudioOnboardingTourStep: (step: number) => void;
  completeStudioInAppOnboarding: () => void;
  setStudioInAppOnboardingTourStep: (step: number) => void;
  restartStudioOnboarding: () => void;
  incrementSessionCount: () => void;
  dismissHint: (hintId: string) => void;
  setLastSessionPath: (path: string | null) => void;
  setStudioSelectedCatalogId: (id: string | null) => void;
  setStudioCatalogCategory: (category: CatalogCategory | null) => void;
  setCatalogLanguage: (language: string) => void;
  setMiniSceneEnabled: (enabled: boolean) => void;
  setMiniSceneSize: (size: 2 | 3) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      recentProjects: [],
      textureCacheLimit: 512,
      modelCacheLimit: 256,
      uiScale: 1,
      workspaceMode: "classic" as WorkspaceMode,
      catalogIconMode: "auto" as CatalogIconMode,
      catalogIconCacheLimit: 256,
      catalogShowCellLabels: false,
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
      pinnedCatalogIds: [],
      recentCatalogIds: [],
      studioShowFloorGrid: false,
      onboardingCompleted: false,
      onboardingTourStep: 0,
      studioOnboardingCompleted: false,
      studioOnboardingTourStep: 0,
      studioInAppOnboardingCompleted: false,
      studioInAppOnboardingTourStep: 0,
      sessionCount: 0,
      dismissedHints: [],
      lastSessionPath: null,
      studioSelectedCatalogId: null,
      studioCatalogCategory: null,
      catalogLanguage: "en_us",
      miniSceneEnabled: false,
      miniSceneSize: 2,
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const idx = THEME_ORDER.indexOf(get().theme);
        const next = THEME_ORDER[(idx + 1) % THEME_ORDER.length] ?? "dark";
        set({ theme: next });
      },
      toggleTheme: () => get().cycleTheme(),
      addRecentProject: (path, kind) => {
        const next = [
          { path, kind, openedAt: Date.now() },
          ...get().recentProjects.filter((p) => p.path !== path),
        ].slice(0, 8);
        set({ recentProjects: next });
      },
      clearRecentProjects: () => set({ recentProjects: [] }),
      setTextureCacheLimit: (textureCacheLimit) =>
        set({ textureCacheLimit: clampTextureCacheLimit(textureCacheLimit) }),
      setModelCacheLimit: (modelCacheLimit) =>
        set({ modelCacheLimit: clampModelCacheLimit(modelCacheLimit) }),
      setUiScale: (uiScale) => set({ uiScale: Math.max(0.8, Math.min(1.5, uiScale)) }),
      setCatalogIconMode: (catalogIconMode) => set({ catalogIconMode }),
      setCatalogIconCacheLimit: (catalogIconCacheLimit) =>
        set({
          catalogIconCacheLimit: Math.max(64, Math.min(2048, catalogIconCacheLimit)),
        }),
      setCatalogShowCellLabels: (catalogShowCellLabels) => set({ catalogShowCellLabels }),
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
      togglePinnedCatalogId: (catalogId) => {
        const pinned = get().pinnedCatalogIds;
        const next = pinned.includes(catalogId)
          ? pinned.filter((id) => id !== catalogId)
          : [catalogId, ...pinned].slice(0, 32);
        set({ pinnedCatalogIds: next });
      },
      pushRecentCatalogId: (catalogId) => {
        const next = [
          catalogId,
          ...get().recentCatalogIds.filter((id) => id !== catalogId),
        ].slice(0, 12);
        set({ recentCatalogIds: next });
      },
      setStudioShowFloorGrid: (studioShowFloorGrid) => set({ studioShowFloorGrid }),
      completeOnboarding: () => set({ onboardingCompleted: true, onboardingTourStep: 0 }),
      setOnboardingTourStep: (onboardingTourStep) => set({ onboardingTourStep }),
      completeStudioOnboarding: () =>
        set({ studioOnboardingCompleted: true, studioOnboardingTourStep: 0 }),
      setStudioOnboardingTourStep: (studioOnboardingTourStep) =>
        set({ studioOnboardingTourStep }),
      completeStudioInAppOnboarding: () =>
        set({ studioInAppOnboardingCompleted: true, studioInAppOnboardingTourStep: 0 }),
      setStudioInAppOnboardingTourStep: (studioInAppOnboardingTourStep) =>
        set({ studioInAppOnboardingTourStep }),
      restartStudioOnboarding: () =>
        set({
          studioOnboardingCompleted: false,
          studioOnboardingTourStep: 0,
          studioInAppOnboardingCompleted: false,
          studioInAppOnboardingTourStep: 0,
        }),
      incrementSessionCount: () => set({ sessionCount: get().sessionCount + 1 }),
      dismissHint: (hintId) => {
        const dismissed = get().dismissedHints;
        if (dismissed.includes(hintId)) return;
        set({ dismissedHints: [...dismissed, hintId] });
      },
      setLastSessionPath: (lastSessionPath) => set({ lastSessionPath }),
      setStudioSelectedCatalogId: (studioSelectedCatalogId) =>
        set({ studioSelectedCatalogId }),
      setStudioCatalogCategory: (studioCatalogCategory) => set({ studioCatalogCategory }),
      setCatalogLanguage: (catalogLanguage) => set({ catalogLanguage }),
      setMiniSceneEnabled: (miniSceneEnabled) => set({ miniSceneEnabled }),
      setMiniSceneSize: (miniSceneSize) => set({ miniSceneSize }),
    }),
    {
      name: "ind3x-art-settings",
      partialize: (state) => ({
        theme: state.theme,
        recentProjects: state.recentProjects,
        textureCacheLimit: state.textureCacheLimit,
        modelCacheLimit: state.modelCacheLimit,
        uiScale: state.uiScale,
        workspaceMode: state.workspaceMode,
        catalogIconMode: state.catalogIconMode,
        catalogIconCacheLimit: state.catalogIconCacheLimit,
        catalogShowCellLabels: state.catalogShowCellLabels,
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
        pinnedCatalogIds: state.pinnedCatalogIds,
        recentCatalogIds: state.recentCatalogIds,
        studioShowFloorGrid: state.studioShowFloorGrid,
        onboardingCompleted: state.onboardingCompleted,
        onboardingTourStep: state.onboardingTourStep,
        studioOnboardingCompleted: state.studioOnboardingCompleted,
        studioOnboardingTourStep: state.studioOnboardingTourStep,
        studioInAppOnboardingCompleted: state.studioInAppOnboardingCompleted,
        studioInAppOnboardingTourStep: state.studioInAppOnboardingTourStep,
        sessionCount: state.sessionCount,
        dismissedHints: state.dismissedHints,
        lastSessionPath: state.lastSessionPath,
        studioSelectedCatalogId: state.studioSelectedCatalogId,
        studioCatalogCategory: state.studioCatalogCategory,
        catalogLanguage: state.catalogLanguage,
        miniSceneEnabled: state.miniSceneEnabled,
        miniSceneSize: state.miniSceneSize,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.textureCacheLimit = clampTextureCacheLimit(state.textureCacheLimit);
        state.modelCacheLimit = clampModelCacheLimit(state.modelCacheLimit);
      },
    },
  ),
);
