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
    const evicted = this.evictWhileOverBudget();
    notifyCatalogIconKeys([key, ...evicted]);
  }

  delete(key: string): void {
    const existing = this.map.get(key);
    if (existing) {
      this.totalBytes -= estimateDataUrlBytes(existing.url);
      this.map.delete(key);
      notifyCatalogIconKeys([key]);
    }
  }

  clear(): void {
    const keys = [...this.map.keys()];
    this.map.clear();
    this.totalBytes = 0;
    notifyCatalogIconKeys(keys);
  }

  deleteKeysWithPrefix(prefix: string): void {
    const removed: string[] = [];
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) {
        const entry = this.map.get(key);
        if (entry) {
          this.totalBytes -= estimateDataUrlBytes(entry.url);
        }
        this.map.delete(key);
        removed.push(key);
      }
    }
    if (removed.length > 0) notifyCatalogIconKeys(removed);
  }

  /** Shrink or grow entry cap without discarding cached icons (LRU evicts if over new limit). */
  setMaxEntries(limit: number): void {
    this.max = Math.max(32, limit);
    const evicted = this.evictWhileOverBudget();
    if (evicted.length > 0) notifyCatalogIconKeys(evicted);
  }

  private evictWhileOverBudget(): string[] {
    const evicted: string[] = [];
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
      evicted.push(oldest);
      pruneCatalogIconKeyMetadata(oldest);
    }
    return evicted;
  }
}

let sharedLimit = 256;
let sharedCache = new CatalogIconLruCache(256);
const keyListeners = new Map<string, Set<Listener>>();
const globalListeners = new Set<Listener>();
const inflightKeys = new Set<string>();
const failureMessages = new Map<string, string>();
const progressByKey = new Map<string, CatalogIconProgress>();
const snapshotByKey = new Map<string, CatalogIconState>();
const MAX_ICON_METADATA_KEYS = 1024;

/** Shared immutable snapshots for useSyncExternalStore stability. */
const IDLE_ICON_STATE: CatalogIconState = Object.freeze({
  src: null,
  status: "idle",
  error: null,
});

const BAKING_ICON_STATE: CatalogIconState = Object.freeze({
  src: null,
  status: "baking",
  error: null,
});

function invalidateIconStateSnapshots(keys: Iterable<string>): void {
  for (const key of keys) {
    snapshotByKey.delete(key);
  }
}

function stableIconState(key: string, limit: number): CatalogIconState {
  const url = getCatalogIconCache(limit).get(key)?.url ?? null;
  if (url) {
    const phase = progressByKey.get(key);
    const status: CatalogIconStatus = phase === "low" ? "low" : "ready";
    const cached = snapshotByKey.get(key);
    if (
      cached &&
      cached.src === url &&
      cached.status === status &&
      cached.error === null
    ) {
      return cached;
    }
    const next: CatalogIconState = { src: url, status, error: null };
    snapshotByKey.set(key, next);
    return next;
  }

  const failure = failureMessages.get(key);
  if (failure) {
    const cached = snapshotByKey.get(key);
    if (
      cached &&
      cached.src === null &&
      cached.status === "failed" &&
      cached.error === failure
    ) {
      return cached;
    }
    const next: CatalogIconState = { src: null, status: "failed", error: failure };
    snapshotByKey.set(key, next);
    return next;
  }

  if (inflightKeys.has(key)) {
    return BAKING_ICON_STATE;
  }

  snapshotByKey.delete(key);
  return IDLE_ICON_STATE;
}

function pruneCatalogIconKeyMetadata(key: string): void {
  progressByKey.delete(key);
  failureMessages.delete(key);
  inflightKeys.delete(key);
  const subs = keyListeners.get(key);
  if (subs && subs.size === 0) {
    keyListeners.delete(key);
  }
}

function trimIconMetadataMaps(): void {
  while (progressByKey.size > MAX_ICON_METADATA_KEYS) {
    const oldest = progressByKey.keys().next().value;
    if (oldest === undefined) break;
    pruneCatalogIconKeyMetadata(oldest);
  }
  while (failureMessages.size > MAX_ICON_METADATA_KEYS) {
    const oldest = failureMessages.keys().next().value;
    if (oldest === undefined) break;
    pruneCatalogIconKeyMetadata(oldest);
  }
}

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

/** Key-scoped subscription — only cells for this icon re-render on updates. */
export function subscribeCatalogIconKey(key: string, listener: Listener): () => void {
  let set = keyListeners.get(key);
  if (!set) {
    set = new Set();
    keyListeners.set(key, set);
  }
  set.add(listener);
  return () => {
    set!.delete(listener);
    if (set!.size === 0) keyListeners.delete(key);
  };
}

/** Global subscription for aggregate metrics (pending bake count). */
export function subscribeCatalogIconCache(listener: Listener): () => void {
  globalListeners.add(listener);
  return () => globalListeners.delete(listener);
}

function notifyCatalogIconKeys(keys: Iterable<string>): void {
  invalidateIconStateSnapshots(keys);
  const notified = new Set<Listener>();
  for (const key of keys) {
    const subs = keyListeners.get(key);
    if (!subs) continue;
    for (const listener of subs) {
      if (!notified.has(listener)) {
        listener();
        notified.add(listener);
      }
    }
  }
  notifyCatalogIconGlobal();
}

function notifyCatalogIconGlobal(): void {
  for (const listener of globalListeners) listener();
}

export function resetCatalogIconCache(): void {
  sharedCache.clear();
  inflightKeys.clear();
  failureMessages.clear();
  progressByKey.clear();
  snapshotByKey.clear();
  keyListeners.clear();
}

export function invalidateCatalogIconCacheForHandle(handleId: number): void {
  const prefix = `${handleId}:`;
  const touched: string[] = [];
  for (const key of [...inflightKeys]) {
    if (key.startsWith(prefix)) {
      inflightKeys.delete(key);
      touched.push(key);
    }
  }
  for (const key of [...failureMessages.keys()]) {
    if (key.startsWith(prefix)) {
      failureMessages.delete(key);
      touched.push(key);
    }
  }
  for (const key of [...progressByKey.keys()]) {
    if (key.startsWith(prefix)) {
      progressByKey.delete(key);
      touched.push(key);
    }
  }
  for (const key of [...keyListeners.keys()]) {
    if (key.startsWith(prefix)) {
      keyListeners.delete(key);
    }
  }
  getCatalogIconCache(sharedLimit).deleteKeysWithPrefix(prefix);
  if (touched.length > 0) notifyCatalogIconKeys(touched);
}

export function markCatalogIconInflight(key: string): void {
  inflightKeys.add(key);
  failureMessages.delete(key);
  notifyCatalogIconKeys([key]);
}

export function clearCatalogIconInflight(key: string): void {
  inflightKeys.delete(key);
  notifyCatalogIconKeys([key]);
}

export function setCatalogIconProgress(key: string, phase: CatalogIconProgress): void {
  progressByKey.set(key, phase);
  trimIconMetadataMaps();
  notifyCatalogIconKeys([key]);
}

export function setCatalogIconFailure(key: string, message: string): void {
  inflightKeys.delete(key);
  progressByKey.delete(key);
  failureMessages.set(key, message);
  trimIconMetadataMaps();
  notifyCatalogIconKeys([key]);
}

export function clearCatalogIconFailure(key: string): void {
  failureMessages.delete(key);
  notifyCatalogIconKeys([key]);
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
    return IDLE_ICON_STATE;
  }
  const key = catalogIconCacheKey(handleId, iconKey);
  return stableIconState(key, limit);
}
