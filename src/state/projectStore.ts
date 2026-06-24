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
  queryOffset: number;
  queryTotal: number;
  queryLoading: boolean;
  queryHasMore: boolean;
  facets: AssetFacets | null;
  selectedAssetId: string | null;
  selectedAsset: AssetEntry | null;
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
  validationById: Record<string, number>;
  queryRevision: number;
  setAppInfo: (info: AppInfo) => void;
  finishOpen: (result: OpenSourceResult) => void;
  setQueryPage: (
    entries: AssetEntry[],
    total: number,
    append: boolean,
    offset: number,
  ) => void;
  setQueryLoading: (loading: boolean) => void;
  resetQuery: () => void;
  setFacets: (facets: AssetFacets | null) => void;
  setHandle: (result: OpenSourceResult) => void;
  clearProject: () => void;
  selectAsset: (entry: AssetEntry) => void;
  setKindFilter: (kind: AssetKind | "all") => void;
  setNamespaceFilter: (namespace: string) => void;
  setSearch: (search: string) => void;
  setFuzzySearch: (fuzzy: boolean) => void;
  setViewMode: (mode: ExplorerViewMode) => void;
  toggleGroupCollapsed: (groupId: string) => void;
  setAllGroupsCollapsed: (collapsed: boolean, groupIds: string[]) => void;
  setIndexStatus: (status: IndexStatus) => void;
  setIndexProgress: (scanned: number, total: number, stage: string) => void;
  setFromCache: (fromCache: boolean) => void;
  setIpcHealthy: (healthy: boolean) => void;
  setValidationCount: (assetId: string, count: number) => void;
  bumpQueryRevision: () => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  appInfo: null,
  handle: null,
  sourcePath: null,
  sourceKind: null,
  assets: [],
  assetTotal: 0,
  queryOffset: 0,
  queryTotal: 0,
  queryLoading: false,
  queryHasMore: false,
  facets: null,
  selectedAssetId: null,
  selectedAsset: null,
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
  validationById: {},
  queryRevision: 0,
  setAppInfo: (appInfo) => set({ appInfo }),
  finishOpen: (result) =>
    set({
      handle: result.handle,
      sourcePath: result.sourcePath,
      sourceKind: result.sourceKind,
      assetTotal: result.entryCount,
      queryTotal: result.entryCount,
      fromCache: result.fromCache,
      indexStatus: "done",
      assets: [],
      queryOffset: 0,
      queryHasMore: result.entryCount > 0,
      collapsedGroups: {},
      selectedAssetId: null,
      selectedAsset: null,
      facets: null,
      validationById: {},
    }),
  setQueryPage: (entries, total, append, offset) =>
    set((s) => {
      const assets = append ? mergeAssets(s.assets, entries) : entries;
      const nextOffset = offset + entries.length;
      return {
        assets,
        queryTotal: total,
        assetTotal: total,
        queryOffset: nextOffset,
        queryHasMore: nextOffset < total,
      };
    }),
  setQueryLoading: (queryLoading) => set({ queryLoading }),
  resetQuery: () =>
    set({
      assets: [],
      queryOffset: 0,
      queryTotal: 0,
      queryHasMore: false,
    }),
  setFacets: (facets) => set({ facets }),
  setHandle: (result) =>
    set({
      handle: result.handle,
      sourcePath: result.sourcePath,
      sourceKind: result.sourceKind,
      assetTotal: result.entryCount,
      queryTotal: result.entryCount,
      fromCache: result.fromCache,
      indexStatus: "running",
      assets: [],
      queryOffset: 0,
      queryHasMore: false,
      collapsedGroups: {},
      selectedAssetId: null,
      selectedAsset: null,
      validationById: {},
    }),
  clearProject: () =>
    set({
      handle: null,
      sourcePath: null,
      sourceKind: null,
      assets: [],
      assetTotal: 0,
      queryOffset: 0,
      queryTotal: 0,
      queryLoading: false,
      queryHasMore: false,
      facets: null,
      selectedAssetId: null,
      selectedAsset: null,
      indexStatus: "idle",
      indexProgress: 0,
      indexStage: "",
      fromCache: false,
      collapsedGroups: {},
      validationById: {},
      kindFilter: "all",
      namespaceFilter: "",
      search: "",
      queryRevision: 0,
    }),
  selectAsset: (entry) =>
    set({
      selectedAssetId: entry.id,
      selectedAsset: entry,
    }),
  setKindFilter: (kindFilter) => set({ kindFilter }),
  setNamespaceFilter: (namespaceFilter) => set({ namespaceFilter }),
  setSearch: (search) => set({ search }),
  setFuzzySearch: (fuzzySearch) => set({ fuzzySearch }),
  setViewMode: (viewMode) => set({ viewMode }),
  toggleGroupCollapsed: (groupId) =>
    set((s) => ({
      collapsedGroups: {
        ...s.collapsedGroups,
        [groupId]: !s.collapsedGroups[groupId],
      },
    })),
  setAllGroupsCollapsed: (collapsed, groupIds) => {
    const next: Record<string, boolean> = {};
    for (const id of groupIds) {
      next[id] = collapsed;
    }
    set({ collapsedGroups: next });
  },
  setIndexStatus: (indexStatus) => set({ indexStatus }),
  setIndexProgress: (scanned, total, stage) =>
    set({
      indexProgress: total > 0 ? Math.round((scanned / total) * 100) : 0,
      indexStage: stage,
      assetTotal: total > 0 ? total : get().assetTotal,
    }),
  setFromCache: (fromCache) => set({ fromCache }),
  setIpcHealthy: (ipcHealthy) => set({ ipcHealthy }),
  setValidationCount: (assetId, count) =>
    set((s) => ({
      validationById: { ...s.validationById, [assetId]: count },
    })),
  bumpQueryRevision: () => set((s) => ({ queryRevision: s.queryRevision + 1 })),
}));

function mergeAssets(existing: AssetEntry[], incoming: AssetEntry[]): AssetEntry[] {
  const map = new Map(existing.map((e) => [e.id, e]));
  for (const e of incoming) {
    map.set(e.id, e);
  }
  return Array.from(map.values());
}
