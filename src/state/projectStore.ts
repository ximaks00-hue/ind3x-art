import { create } from "zustand";

import type {
  AppInfo,
  AssetEntry,
  AssetFacets,
  AssetKind,
  OpenSourceResult,
  ProjectHandle,
} from "../ipc/types";

export type IndexStatus = "idle" | "running" | "done" | "error";
export type ExplorerViewMode = "flat" | "grouped" | "tree";

interface ProjectState {
  appInfo: AppInfo | null;
  handle: ProjectHandle | null;
  sourcePath: string | null;
  sourceKind: OpenSourceResult["sourceKind"] | null;
  assets: AssetEntry[];
  assetTotal: number;
  facets: AssetFacets | null;
  selectedAssetId: string | null;
  kindFilter: AssetKind | "all";
  namespaceFilter: string;
  search: string;
  fuzzySearch: boolean;
  viewMode: ExplorerViewMode;
  collapsedGroups: Record<string, boolean>;
  indexStatus: IndexStatus;
  indexProgress: number;
  indexStage: string;
  fromCache: boolean;
  ipcHealthy: boolean;
  setAppInfo: (info: AppInfo) => void;
  setProject: (result: OpenSourceResult, assets: AssetEntry[]) => void;
  appendAsset: (entry: AssetEntry) => void;
  setFacets: (facets: AssetFacets | null) => void;
  setHandle: (result: OpenSourceResult) => void;
  clearProject: () => void;
  setSelectedAssetId: (id: string | null) => void;
  setKindFilter: (kind: AssetKind | "all") => void;
  setNamespaceFilter: (namespace: string) => void;
  setSearch: (search: string) => void;
  setFuzzySearch: (fuzzy: boolean) => void;
  setViewMode: (mode: ExplorerViewMode) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  setIndexStatus: (status: IndexStatus) => void;
  setIndexProgress: (scanned: number, total: number, stage: string) => void;
  setFromCache: (fromCache: boolean) => void;
  setIpcHealthy: (healthy: boolean) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  appInfo: null,
  handle: null,
  sourcePath: null,
  sourceKind: null,
  assets: [],
  assetTotal: 0,
  facets: null,
  selectedAssetId: null,
  kindFilter: "all",
  namespaceFilter: "",
  search: "",
  fuzzySearch: true,
  viewMode: "grouped",
  collapsedGroups: {},
  indexStatus: "idle",
  indexProgress: 0,
  indexStage: "",
  fromCache: false,
  ipcHealthy: false,
  setAppInfo: (appInfo) => set({ appInfo }),
  setProject: (result, assets) =>
    set({
      handle: result.handle,
      sourcePath: result.sourcePath,
      sourceKind: result.sourceKind,
      assets,
      assetTotal: result.entryCount,
      fromCache: result.fromCache,
      indexStatus: "done",
      selectedAssetId: assets[0]?.id ?? null,
      collapsedGroups: {},
    }),
  appendAsset: (entry) =>
    set((s) => ({
      assets: [...s.assets, entry],
      assetTotal: s.assetTotal + 1,
    })),
  setHandle: (result) =>
    set({
      handle: result.handle,
      sourcePath: result.sourcePath,
      sourceKind: result.sourceKind,
      assetTotal: result.entryCount,
      fromCache: result.fromCache,
      indexStatus: "running",
      assets: [],
      collapsedGroups: {},
    }),
  setFacets: (facets) => set({ facets }),
  clearProject: () =>
    set({
      handle: null,
      sourcePath: null,
      sourceKind: null,
      assets: [],
      assetTotal: 0,
      facets: null,
      selectedAssetId: null,
      indexStatus: "idle",
      indexProgress: 0,
      indexStage: "",
      fromCache: false,
      collapsedGroups: {},
    }),
  setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),
  setKindFilter: (kindFilter) => set({ kindFilter }),
  setNamespaceFilter: (namespaceFilter) => set({ namespaceFilter }),
  setSearch: (search) => set({ search }),
  setFuzzySearch: (fuzzySearch) => set({ fuzzySearch }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleGroupCollapsed: (groupId) =>
    set({
      collapsedGroups: {
        ...get().collapsedGroups,
        [groupId]: !get().collapsedGroups[groupId],
      },
    }),
  setIndexStatus: (indexStatus) => set({ indexStatus }),
  setIndexProgress: (scanned, total, stage) =>
    set({
      indexProgress: total > 0 ? Math.round((scanned / total) * 100) : 0,
      indexStage: stage,
    }),
  setFromCache: (fromCache) => set({ fromCache }),
  setIpcHealthy: (ipcHealthy) => set({ ipcHealthy }),
}));
