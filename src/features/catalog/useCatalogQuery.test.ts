import { beforeEach, describe, expect, it, vi } from "vitest";

const catalogServiceMock = vi.hoisted(() => ({
  queryCatalog: vi.fn(),
  getCatalogFacets: vi.fn(),
}));

const pushToastMock = vi.hoisted(() => vi.fn());

vi.mock("../../app/services/catalogService", () => catalogServiceMock);
vi.mock("../../state/uiStore", () => ({
  useUiStore: (selector: (s: { pushToast: typeof pushToastMock }) => unknown) =>
    selector({ pushToast: pushToastMock }),
}));

import { flushCatalogSearchDebounce, useCatalogStore } from "./catalogStore";
import { useCatalogQuery, CATALOG_PAGE_SIZE } from "./useCatalogQuery";
import { useProjectStore } from "../../state/projectStore";
import { renderHook, waitFor } from "@testing-library/react";

describe("useCatalogQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCatalogStore.getState().reset();
    useProjectStore.setState({
      handle: { id: 1 },
      indexStatus: "done",
      fuzzySearch: true,
    } as Partial<ReturnType<typeof useProjectStore.getState>>);
    catalogServiceMock.queryCatalog.mockResolvedValue({
      entries: [
        {
          id: "minecraft:stone",
          namespace: "minecraft",
          displayName: "Stone",
          kind: "block",
          sourcePath: "assets/minecraft/blockstates/stone.json",
          resolveKind: "blockstate",
          category: "building",
          searchTokens: [],
          texturePaths: [],
          iconKey: "minecraft:stone:",
          aliases: [],
        },
      ],
      total: 1,
    });
    catalogServiceMock.getCatalogFacets.mockResolvedValue({
      byCategory: [{ key: "building", count: 1 }],
    });
  });

  it("fetches catalog page when project is ready", async () => {
    renderHook(() => useCatalogQuery());
    await waitFor(() => {
      expect(catalogServiceMock.queryCatalog).toHaveBeenCalledWith(
        { id: 1 },
        { category: null, namespace: null, search: null, fuzzy: true },
        { offset: 0, limit: CATALOG_PAGE_SIZE },
      );
    });
    expect(useCatalogStore.getState().entries).toHaveLength(1);
    expect(useCatalogStore.getState().total).toBe(1);
  });

  it("surfaces query errors via store and toast", async () => {
    catalogServiceMock.queryCatalog.mockRejectedValue(new Error("IPC down"));
    renderHook(() => useCatalogQuery());
    await waitFor(() => {
      expect(useCatalogStore.getState().queryError).toBe("IPC down");
    });
    expect(pushToastMock).toHaveBeenCalledWith("Catalog query failed: IPC down", "error");
  });

  it("uses debounced search from store", async () => {
    useCatalogStore.getState().setSearch("stone");
    flushCatalogSearchDebounce();
    renderHook(() => useCatalogQuery());
    await waitFor(() => {
      expect(catalogServiceMock.queryCatalog).toHaveBeenCalledWith(
        { id: 1 },
        expect.objectContaining({ search: "stone", fuzzy: true }),
        expect.any(Object),
      );
    });
  });
});
