import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcMock = vi.hoisted(() => ({
  queryCatalog: vi.fn(),
  getCatalogEntry: vi.fn(),
  getCatalogFacets: vi.fn(),
  resolveCatalogEntry: vi.fn(),
}));

vi.mock("../../ipc/client", () => ({
  ipc: ipcMock,
}));

import {
  getCatalogEntry,
  getCatalogFacets,
  queryCatalog,
  resolveCatalogEntry,
} from "./catalogService";

const handle = { id: 1 };

describe("catalogService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates queryCatalog to ipc", async () => {
    ipcMock.queryCatalog.mockResolvedValue({ entries: [], total: 0 });
    const filter = { category: null, namespace: null, search: "stone", fuzzy: false };
    const page = { offset: 0, limit: 50 };
    await queryCatalog(handle, filter, page);
    expect(ipcMock.queryCatalog).toHaveBeenCalledWith(handle, filter, page);
  });

  it("delegates getCatalogFacets to ipc", async () => {
    ipcMock.getCatalogFacets.mockResolvedValue({ byCategory: [] });
    await getCatalogFacets(handle);
    expect(ipcMock.getCatalogFacets).toHaveBeenCalledWith(handle);
  });

  it("delegates resolveCatalogEntry to ipc", async () => {
    ipcMock.resolveCatalogEntry.mockResolvedValue({ elements: [], textureMeta: {} });
    await resolveCatalogEntry(handle, "minecraft:test_stone");
    expect(ipcMock.resolveCatalogEntry).toHaveBeenCalledWith(
      handle,
      "minecraft:test_stone",
      "icon",
      null,
    );
  });

  it("delegates getCatalogEntry to ipc", async () => {
    ipcMock.getCatalogEntry.mockResolvedValue({ id: "minecraft:test_stone" });
    await getCatalogEntry(handle, "minecraft:test_stone");
    expect(ipcMock.getCatalogEntry).toHaveBeenCalledWith(handle, "minecraft:test_stone");
  });
});
