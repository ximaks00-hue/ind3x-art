import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  catalogIconCacheKey,
  CatalogIconLruCache,
  getCatalogIconCache,
  readCatalogIconUrl,
  resetCatalogIconCache,
  setCatalogIconFailure,
  clearCatalogIconFailure,
  readCatalogIconState,
  subscribeCatalogIconCache,
  subscribeCatalogIconKey,
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

  it("notifies key-scoped subscribers on set", () => {
    const keyListener = vi.fn();
    const otherListener = vi.fn();
    const key = catalogIconCacheKey(1, "minecraft:stone:");
    const unsubKey = subscribeCatalogIconKey(key, keyListener);
    const unsubOther = subscribeCatalogIconKey("other:key", otherListener);
    getCatalogIconCache(64).set(key, { url: "data:x", tier: 1 });
    expect(keyListener).toHaveBeenCalled();
    expect(otherListener).not.toHaveBeenCalled();
    unsubKey();
    unsubOther();
  });

  it("notifies global subscribers on set", () => {
    const listener = vi.fn();
    const unsub = subscribeCatalogIconCache(listener);
    getCatalogIconCache(64).set("k", { url: "data:x", tier: 1 });
    expect(listener).toHaveBeenCalled();
    unsub();
  });

  it("notifies key-scoped subscribers when failure is cleared", () => {
    const key = catalogIconCacheKey(1, "minecraft:stone:");
    setCatalogIconFailure(key, "bake failed");
    expect(readCatalogIconState(1, "minecraft:stone:", 64).status).toBe("failed");

    const listener = vi.fn();
    const unsub = subscribeCatalogIconKey(key, listener);
    clearCatalogIconFailure(key);
    expect(listener).toHaveBeenCalled();
    expect(readCatalogIconState(1, "minecraft:stone:", 64).status).toBe("idle");
    unsub();
  });

  it("returns stable snapshot references for unchanged icon state", () => {
    const key = catalogIconCacheKey(1, "minecraft:stone:");
    const first = readCatalogIconState(1, "minecraft:stone:", 64);
    const second = readCatalogIconState(1, "minecraft:stone:", 64);
    expect(first).toBe(second);
    expect(first).toBe(readCatalogIconState(1, "minecraft:dirt:", 64));

    getCatalogIconCache(64).set(key, { url: "data:image/png;base64,abc", tier: 1 });
    const ready = readCatalogIconState(1, "minecraft:stone:", 64);
    const readyAgain = readCatalogIconState(1, "minecraft:stone:", 64);
    expect(ready.status).toBe("ready");
    expect(ready).toBe(readyAgain);
    expect(ready).not.toBe(first);
  });

  it("resizes shared cache without dropping entries when limit changes", () => {
    const key = catalogIconCacheKey(1, "minecraft:stone:");
    getCatalogIconCache(64).set(key, { url: "data:image/png;base64,abc", tier: 1 });
    expect(readCatalogIconUrl(1, "minecraft:stone:", 64)).toBe("data:image/png;base64,abc");

    getCatalogIconCache(128);
    expect(readCatalogIconUrl(1, "minecraft:stone:", 128)).toBe("data:image/png;base64,abc");

    getCatalogIconCache(32);
    expect(readCatalogIconUrl(1, "minecraft:stone:", 32)).toBe("data:image/png;base64,abc");
  });
});
