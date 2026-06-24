import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const pushToastMock = vi.hoisted(() => vi.fn());

vi.mock("../../app/services/catalogService", () => ({
  queryCatalog: vi.fn(),
  getCatalogFacets: vi.fn(),
  rebuildProjectCatalog: vi.fn(),
}));

vi.mock("../../state/uiStore", () => ({
  useUiStore: (selector: (s: { pushToast: typeof pushToastMock }) => unknown) =>
    selector({ pushToast: pushToastMock }),
}));

import * as catalogService from "../../app/services/catalogService";
import { flushCatalogSearchDebounce, useCatalogStore } from "./catalogStore";
import { useCatalogQuery, CATALOG_PAGE_SIZE } from "./useCatalogQuery";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";

describe("useCatalogQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useCatalogStore.getState().reset();
    useSettingsStore.setState({ workspaceMode: "studio" });
    useProjectStore.setState({
      handle: { id: 1 },
      indexStatus: "done",
      fuzzySearch: true,
    } as Partial<ReturnType<typeof useProjectStore.getState>>);
    vi.mocked(catalogService.queryCatalog).mockResolvedValue({
      entries: [
        {
          id: "minecraft:stone",
          namespace: "minecraft",
          displayName: "Stone",
          kind: "block",
          sourcePath: "assets/minecraft/blockstates/stone.json",
          studioModelPath: "assets/minecraft/blockstates/stone.json",
          resolveKind: "blockstate",
          category: "building",
          presentation: "block",
          searchTokens: [],
          texturePaths: [],
          iconKey: "minecraft:stone:",
          aliases: [],
        },
      ],
      total: 1,
    });
    vi.mocked(catalogService.getCatalogFacets).mockResolvedValue({
      byCategory: [{ key: "building", count: 1 }],
    });
    vi.mocked(catalogService.rebuildProjectCatalog).mockResolvedValue(undefined);
  });

  it("fetches catalog page when project is ready", async () => {
    await act(async () => {
      renderHook(() => useCatalogQuery());
      await Promise.resolve();
    });
    expect(catalogService.queryCatalog).toHaveBeenCalledWith(
      { id: 1 },
      { category: null, namespace: null, search: null, fuzzy: true },
      { offset: 0, limit: CATALOG_PAGE_SIZE },
    );
    expect(useCatalogStore.getState().entries).toHaveLength(1);
    expect(useCatalogStore.getState().total).toBe(1);
  });

  it("surfaces query errors via store and toast", async () => {
    vi.mocked(catalogService.queryCatalog).mockRejectedValue(new Error("IPC down"));
    await act(async () => {
      renderHook(() => useCatalogQuery());
      await Promise.resolve();
    });
    expect(useCatalogStore.getState().queryError).toBe("IPC down");
    expect(pushToastMock).toHaveBeenCalledWith("Catalog query failed: IPC down", "error");
  });

  it("uses debounced search from store", async () => {
    useCatalogStore.getState().setSearch("stone");
    flushCatalogSearchDebounce();
    await act(async () => {
      renderHook(() => useCatalogQuery());
      await Promise.resolve();
    });
    expect(catalogService.queryCatalog).toHaveBeenCalledWith(
      { id: 1 },
      expect.objectContaining({ search: "stone", fuzzy: true }),
      expect.any(Object),
    );
  });
});
