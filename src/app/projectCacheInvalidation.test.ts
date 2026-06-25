import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invalidateCatalogIconCacheForHandle: vi.fn(),
  resetCatalogIconCache: vi.fn(),
  resetCatalogIconPipeline: vi.fn(),
  clearStudioResolveCacheForHandle: vi.fn(),
  clearStudioResolveCache: vi.fn(),
  resetThumbnailCache: vi.fn(),
  bumpQueryRevision: vi.fn(),
}));

vi.mock("../features/catalog/catalogIconCache", () => ({
  invalidateCatalogIconCacheForHandle: mocks.invalidateCatalogIconCacheForHandle,
  resetCatalogIconCache: mocks.resetCatalogIconCache,
}));

vi.mock("../features/catalog/catalogIconPipeline", () => ({
  resetCatalogIconPipeline: mocks.resetCatalogIconPipeline,
}));

vi.mock("../features/catalog/studioResolveCache", () => ({
  clearStudioResolveCacheForHandle: mocks.clearStudioResolveCacheForHandle,
  clearStudioResolveCache: mocks.clearStudioResolveCache,
}));

vi.mock("../features/explorer/thumbnailCache", () => ({
  resetThumbnailCache: mocks.resetThumbnailCache,
}));

vi.mock("../features/catalog/catalogStore", () => ({
  useCatalogStore: {
    setState: vi.fn((updater: (s: { queryRevision: number }) => { queryRevision: number }) => {
      updater({ queryRevision: 0 });
    }),
  },
}));

vi.mock("../state/projectStore", () => ({
  useProjectStore: {
    getState: () => ({
      handle: { id: 42 },
      bumpQueryRevision: mocks.bumpQueryRevision,
    }),
  },
}));

import { invalidateProjectCaches } from "./projectCacheInvalidation";

describe("invalidateProjectCaches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates icon and studio invalidation when catalog and icons scopes overlap", () => {
    invalidateProjectCaches({ catalog: true, icons: true, studio: true });

    expect(mocks.invalidateCatalogIconCacheForHandle).toHaveBeenCalledTimes(1);
    expect(mocks.invalidateCatalogIconCacheForHandle).toHaveBeenCalledWith(42);
    expect(mocks.clearStudioResolveCacheForHandle).toHaveBeenCalledTimes(1);
    expect(mocks.clearStudioResolveCacheForHandle).toHaveBeenCalledWith(42);
    expect(mocks.resetCatalogIconPipeline).toHaveBeenCalledTimes(1);
  });

  it("invalidates icons from catalog scope when icons scope is omitted", () => {
    invalidateProjectCaches({ catalog: true });

    expect(mocks.invalidateCatalogIconCacheForHandle).toHaveBeenCalledTimes(1);
    expect(mocks.clearStudioResolveCacheForHandle).toHaveBeenCalledTimes(1);
    expect(mocks.resetCatalogIconPipeline).not.toHaveBeenCalled();
  });
});
