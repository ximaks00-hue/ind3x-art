/** LRU cache for texture preview data URLs. */
export class ThumbnailLruCache {
  private max: number;
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
    this.trim();
  }

  resize(maxEntries: number): void {
    this.max = Math.max(16, maxEntries);
    this.trim();
  }

  private trim(): void {
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
    sharedCache.resize(limit);
  }
  return sharedCache;
}

export function resetThumbnailCache(): void {
  sharedCache?.clear();
}

export function thumbnailCacheKey(handleId: number, assetPath: string): string {
  return `${handleId}:${assetPath}`;
}

const inflight = new Map<string, Promise<string>>();

export function isThumbnailInflight(key: string): boolean {
  return inflight.has(key);
}

/** Deduplicate concurrent thumbnail fetches for the same cache key. */
export function fetchThumbnailDataUrl(
  key: string,
  load: () => Promise<string>,
): Promise<string> {
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = load().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/** Register batch prefetch promises so single-thumbnail loads share inflight state. */
export function trackThumbnailBatch(
  keys: string[],
  cache: ThumbnailLruCache,
  batch: Promise<void>,
): void {
  const tracked = batch.finally(() => {
    for (const key of keys) inflight.delete(key);
  });
  for (const key of keys) {
    if (inflight.has(key)) continue;
    inflight.set(
      key,
      tracked.then(() => {
        const url = cache.get(key);
        if (!url) throw new Error("thumbnail missing after batch");
        return url;
      }),
    );
  }
}
