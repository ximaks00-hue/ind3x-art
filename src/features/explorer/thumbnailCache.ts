/** LRU cache for texture preview data URLs. */
export class ThumbnailLruCache {
  private readonly max: number;
  private readonly map = new Map<string, string>();

  constructor(maxEntries: number) {
    this.max = Math.max(16, maxEntries);
  }

  get(key: string): string | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    }
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }
}

let sharedLimit = 512;
let sharedCache = new ThumbnailLruCache(512);

export function getThumbnailCache(limit: number): ThumbnailLruCache {
  if (limit !== sharedLimit) {
    sharedLimit = limit;
    sharedCache = new ThumbnailLruCache(limit);
  }
  return sharedCache;
}

export function resetThumbnailCache(): void {
  sharedCache?.clear();
}

export function thumbnailCacheKey(handleId: number, assetPath: string): string {
  return `${handleId}:${assetPath}`;
}
