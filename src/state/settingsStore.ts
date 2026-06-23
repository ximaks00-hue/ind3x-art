import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";

export interface RecentProject {
  path: string;
  kind: "jar" | "folder";
  openedAt: number;
}

interface SettingsState {
  theme: Theme;
  recentProjects: RecentProject[];
  /** Max texture cache entries (LRU) */
  textureCacheLimit: number;
  /** Max model cache entries */
  modelCacheLimit: number;
  /** UI scale factor (0.8 – 1.5) */
  uiScale: number;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  addRecentProject: (path: string, kind: "jar" | "folder") => void;
  clearRecentProjects: () => void;
  setTextureCacheLimit: (n: number) => void;
  setModelCacheLimit: (n: number) => void;
  setUiScale: (scale: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: "dark",
      recentProjects: [],
      textureCacheLimit: 512,
      modelCacheLimit: 256,
      uiScale: 1,
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === "dark" ? "light" : "dark" }),
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
    }),
    {
      name: "ind3x-art-settings",
      partialize: (state) => ({
        theme: state.theme,
        recentProjects: state.recentProjects,
        textureCacheLimit: state.textureCacheLimit,
        modelCacheLimit: state.modelCacheLimit,
        uiScale: state.uiScale,
      }),
    },
  ),
);
