import { describe, expect, it } from "vitest";

import { ThumbnailLruCache, thumbnailCacheKey } from "./thumbnailCache";

describe("thumbnail cache", () => {
  it("scopes keys by handle id", () => {
    const cache = new ThumbnailLruCache(32);
    cache.set(thumbnailCacheKey(1, "assets/test/a.png"), "a1");
    cache.set(thumbnailCacheKey(2, "assets/test/a.png"), "a2");

    expect(cache.get(thumbnailCacheKey(1, "assets/test/a.png"))).toBe("a1");
    expect(cache.get(thumbnailCacheKey(2, "assets/test/a.png"))).toBe("a2");
  });
});
