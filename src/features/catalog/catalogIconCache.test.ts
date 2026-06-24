import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  catalogIconCacheKey,
  CatalogIconLruCache,
  getCatalogIconCache,
  readCatalogIconUrl,
  resetCatalogIconCache,
  subscribeCatalogIconCache,
} from "./catalogIconCache";

describe("catalogIconCache", () => {
  beforeEach(() => {
    resetCatalogIconCache();
  });

  it("stores and reads icon urls by handle + iconKey", () => {
    const key = catalogIconCacheKey(1, "minecraft:stone:");
    getCatalogIconCache(64).set(key, { url: "data:image/png;base64,abc", tier: 1 });
    expect(readCatalogIconUrl(1, "minecraft:stone:", 64)).toBe(
      "data:image/png;base64,abc",
    );
  });

  it("evicts oldest entries when over limit", () => {
    const cache = getCatalogIconCache(64);
    for (let i = 0; i < 64; i++) {
      cache.set(`key-${i}`, { url: `data:${i}`, tier: 1 });
    }
    cache.set("key-new", { url: "data:new", tier: 2 });
    expect(cache.get("key-0")).toBeUndefined();
    expect(cache.get("key-new")?.url).toBe("data:new");
  });

  it("evicts by byte budget when entries are large", () => {
    const cache = new CatalogIconLruCache(10_000, 800);
    const chunk = "A".repeat(1_200);
    cache.set("a", { url: `data:image/png;base64,${chunk}`, tier: 1 });
    cache.set("b", { url: `data:image/png;base64,${chunk}`, tier: 1 });
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")?.url).toContain(chunk);
    expect(cache.bytesUsed).toBeGreaterThan(800);
  });

  it("notifies subscribers on set", () => {
    const listener = vi.fn();
    const unsub = subscribeCatalogIconCache(listener);
    getCatalogIconCache(64).set("k", { url: "data:x", tier: 1 });
    expect(listener).toHaveBeenCalled();
    unsub();
  });
});
