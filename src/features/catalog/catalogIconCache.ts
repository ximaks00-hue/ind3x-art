export type CatalogIconTier = 1 | 2;

export type CatalogIconStatus = "idle" | "baking" | "low" | "ready" | "failed";

export type CatalogIconProgress = "skeleton" | "low" | "final";

export interface CatalogIconCacheEntry {
  url: string;
  tier: CatalogIconTier;
}

export interface CatalogIconState {
  src: string | null;
  status: CatalogIconStatus;
  error: string | null;
}

type Listener = () => void;

/** Phase 6 memory budget — icon LRU evicts when total decoded bytes exceed this. */
export const CATALOG_ICON_MAX_BYTES = 500 * 1024 * 1024;

export function estimateDataUrlBytes(url: string): number {
  const comma = url.indexOf(",");
  if (comma < 0) return url.length;
  const base64Len = url.length - comma - 1;
  return Math.ceil(base64Len * 0.75);
}

/** LRU cache for baked catalog icon data URLs (tier-1 preview, tier-2 GUI 3D). */
export class CatalogIconLruCache {
  private max: number;
  private readonly maxBytes: number;
  private readonly map = new Map<string, CatalogIconCacheEntry>();
  private totalBytes = 0;

  constructor(maxEntries: number, maxBytes = CATALOG_ICON_MAX_BYTES) {
    this.max = Math.max(32, maxEntries);
    this.maxBytes = maxBytes;
  }

  get size(): number {
    return this.map.size;
  }

  get bytesUsed(): number {
    return this.totalBytes;
  }

  get(key: string): CatalogIconCacheEntry | undefined {
    const value = this.map.get(key);
    if (!value) return undefined;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: string, value: CatalogIconCacheEntry): void {
    const bytes = estimateDataUrlBytes(value.url);
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes -= estimateDataUrlBytes(existing.url);
      this.map.delete(key);
    }
    this.map.set(key, value);
    this.totalBytes += bytes;
    this.evictWhileOverBudget();
    notifyCatalogIconCache();
  }

  delete(key: string): void {
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes -= estimateDataUrlBytes(existing.url);
      this.map.delete(key);
      notifyCatalogIconCache();
    }
  }

  clear(): void {
    this.map.clear();
    this.totalBytes = 0;
    notifyCatalogIconCache();
  }

  deleteKeysWithPrefix(prefix: string): void {
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) {
        const removed = this.map.get(key);
        if (removed) {
          this.totalBytes -= estimateDataUrlBytes(removed.url);
        }
        this.map.delete(key);
      }
    }
    notifyCatalogIconCache();
  }

  /** Shrink or grow entry cap without discarding cached icons (LRU evicts if over new limit). */
  setMaxEntries(limit: number): void {
    this.max = Math.max(32, limit);
    this.evictWhileOverBudget();
    notifyCatalogIconCache();
  }

  private evictWhileOverBudget(): void {
    while (
      (this.map.size > this.max || this.totalBytes > this.maxBytes) &&
      this.map.size > 1
    ) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      const removed = this.map.get(oldest);
      if (removed) {
        this.totalBytes -= estimateDataUrlBytes(removed.url);
      }
      this.map.delete(oldest);
    }
  }
}

let sharedLimit = 256;
let sharedCache = new CatalogIconLruCache(256);
const listeners = new Set<Listener>();
const inflightKeys = new Set<string>();
const failureMessages = new Map<string, string>();
const progressByKey = new Map<string, CatalogIconProgress>();

export function catalogIconCacheKey(handleId: number, iconKey: string): string {
  return `${handleId}:${iconKey}`;
}

export function getCatalogIconCache(limit: number): CatalogIconLruCache {
  if (limit !== sharedLimit) {
    sharedLimit = limit;
    sharedCache.setMaxEntries(limit);
  }
  return sharedCache;
}

export function subscribeCatalogIconCache(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyCatalogIconCache(): void {
  for (const listener of listeners) listener();
}

export function resetCatalogIconCache(): void {
  sharedCache.clear();
  inflightKeys.clear();
  failureMessages.clear();
  progressByKey.clear();
}

export function invalidateCatalogIconCacheForHandle(handleId: number): void {
  const prefix = `${handleId}:`;
  for (const key of [...inflightKeys]) {
    if (key.startsWith(prefix)) inflightKeys.delete(key);
  }
  for (const key of [...failureMessages.keys()]) {
    if (key.startsWith(prefix)) failureMessages.delete(key);
  }
  getCatalogIconCache(sharedLimit).deleteKeysWithPrefix(prefix);
}

export function markCatalogIconInflight(key: string): void {
  inflightKeys.add(key);
  failureMessages.delete(key);
  notifyCatalogIconCache();
}

export function clearCatalogIconInflight(key: string): void {
  inflightKeys.delete(key);
  notifyCatalogIconCache();
}

export function setCatalogIconProgress(key: string, phase: CatalogIconProgress): void {
  progressByKey.set(key, phase);
  notifyCatalogIconCache();
}

export function setCatalogIconFailure(key: string, message: string): void {
  inflightKeys.delete(key);
  progressByKey.delete(key);
  failureMessages.set(key, message);
  notifyCatalogIconCache();
}

export function clearCatalogIconFailure(key: string): void {
  failureMessages.delete(key);
  notifyCatalogIconCache();
}

export function getCatalogIconPendingCount(): number {
  return inflightKeys.size;
}

export function readCatalogIconUrl(
  handleId: number | undefined,
  iconKey: string,
  limit: number,
): string | null {
  if (!handleId) return null;
  const key = catalogIconCacheKey(handleId, iconKey);
  return getCatalogIconCache(limit).get(key)?.url ?? null;
}

export function readCatalogIconState(
  handleId: number | undefined,
  iconKey: string,
  limit: number,
): CatalogIconState {
  if (!handleId) {
    return { src: null, status: "idle", error: null };
  }
  const key = catalogIconCacheKey(handleId, iconKey);
  const url = getCatalogIconCache(limit).get(key)?.url ?? null;
  if (url) {
    const phase = progressByKey.get(key);
    return {
      src: url,
      status: phase === "low" ? "low" : "ready",
      error: null,
    };
  }
  const failure = failureMessages.get(key);
  if (failure) {
    return { src: null, status: "failed", error: failure };
  }
  if (inflightKeys.has(key)) {
    return { src: null, status: "baking", error: null };
  }
  return { src: null, status: "idle", error: null };
}
