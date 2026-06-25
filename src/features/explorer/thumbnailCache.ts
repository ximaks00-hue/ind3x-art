/** LRU cache for texture preview data URLs. */
export class ThumbnailLruCache {
  private max: number;
  private readonly maxBytes: number;
  private readonly map = new Map<string, string>();
  private totalBytes = 0;

  constructor(maxEntries: number, maxBytes = 64 * 1024 * 1024) {
    this.max = Math.max(16, maxEntries);
    this.maxBytes = maxBytes;
  }

  get(key: string): string | undefined {
    const value = this.map.get(key);
    if (value === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: string): void {
    const bytes = estimateDataUrlBytes(value);
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes -= estimateDataUrlBytes(existing);
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.totalBytes += bytes;
    this.trim();
  }

  resize(maxEntries: number): void {
    this.max = Math.max(16, maxEntries);
    this.trim();
  }

  private trim(): void {
    while ((this.map.size > this.max || this.totalBytes > this.maxBytes) && this.map.size > 1) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const removed = this.map.get(oldest);
      if (removed) this.totalBytes -= estimateDataUrlBytes(removed);
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
    this.totalBytes = 0;
  }
}

function estimateDataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  if (comma < 0) return url.length;
  const base64Len = url.length - comma - 1;
  return Math.ceil(base64Len * 0.75);
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
  sharedCache.clear();
  inflight.clear();
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

export function cancelThumbnailInflight(keys: Iterable<string>): void {
  for (const key of keys) inflight.delete(key);
}
