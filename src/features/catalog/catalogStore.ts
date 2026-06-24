import { create } from "zustand";

import type { CatalogCategory, CatalogEntry, CatalogFacets } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { invalidateCatalogIconCacheForHandle } from "./catalogIconCache";

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;

interface CatalogState {
  entries: CatalogEntry[];
  total: number;
  offset: number;
  loading: boolean;
  hasMore: boolean;
  search: string;
  debouncedSearch: string;
  category: CatalogCategory | null;
  facets: CatalogFacets | null;
  queryError: string | null;
  facetsError: string | null;
  selectedId: string | null;
  selectedEntry: CatalogEntry | null;
  focusIndex: number;
  queryRevision: number;
  setSearch: (search: string) => void;
  setCategory: (category: CatalogCategory | null) => void;
  setQueryPage: (
    entries: CatalogEntry[],
    total: number,
    append: boolean,
    offset: number,
  ) => void;
  setQueryLoading: (loading: boolean) => void;
  setQueryError: (error: string | null) => void;
  setFacetsError: (error: string | null) => void;
  resetQuery: () => void;
  setFacets: (facets: CatalogFacets | null) => void;
  selectEntry: (entry: CatalogEntry) => void;
  setFocusIndex: (index: number) => void;
  clearSelection: () => void;
  bumpQueryRevision: () => void;
  reset: () => void;
}

const initialState = {
  entries: [] as CatalogEntry[],
  total: 0,
  offset: 0,
  loading: false,
  hasMore: false,
  search: "",
  debouncedSearch: "",
  category: null as CatalogCategory | null,
  facets: null as CatalogFacets | null,
  queryError: null as string | null,
  facetsError: null as string | null,
  selectedId: null as string | null,
  selectedEntry: null as CatalogEntry | null,
  focusIndex: 0,
  queryRevision: 0,
};

export const useCatalogStore = create<CatalogState>((set, get) => ({
  ...initialState,
  setSearch: (search) => {
    set({ search });
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      set({ debouncedSearch: search });
    }, 200);
  },
  setCategory: (category) => set({ category }),
  setQueryPage: (entries, total, append, offset) =>
    set((s) => {
      const merged = append ? mergeCatalogEntries(s.entries, entries) : entries;
      const nextOffset = offset + entries.length;
      return {
        entries: merged,
        total,
        offset: nextOffset,
        hasMore: nextOffset < total,
        queryError: null,
      };
    }),
  setQueryLoading: (loading) => set({ loading }),
  setQueryError: (queryError) => set({ queryError }),
  setFacetsError: (facetsError) => set({ facetsError }),
  resetQuery: () =>
    set({
      entries: [],
      total: 0,
      offset: 0,
      hasMore: false,
      queryError: null,
    }),
  setFacets: (facets) => set({ facets, facetsError: null }),
  selectEntry: (entry) =>
    set({
      selectedId: entry.id,
      selectedEntry: entry,
    }),
  setFocusIndex: (focusIndex) => set({ focusIndex }),
  clearSelection: () => set({ selectedId: null, selectedEntry: null }),
  bumpQueryRevision: () => {
    const handle = useProjectStore.getState().handle;
    if (handle) invalidateCatalogIconCacheForHandle(handle.id);
    set({ queryRevision: get().queryRevision + 1 });
  },
  reset: () => {
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    set({ ...initialState });
  },
}));

function mergeCatalogEntries(
  existing: CatalogEntry[],
  incoming: CatalogEntry[],
): CatalogEntry[] {
  const seen = new Set(existing.map((e) => e.id));
  const out = [...existing];
  for (const entry of incoming) {
    if (!seen.has(entry.id)) {
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/** Flush debounced search immediately (tests). */
export function flushCatalogSearchDebounce(): void {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  const search = useCatalogStore.getState().search;
  useCatalogStore.setState({ debouncedSearch: search });
}
