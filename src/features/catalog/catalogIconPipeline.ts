import type { CatalogEntry, ProjectHandle, RenderableModel } from "../../ipc/types";
import {
  getCatalogIconCache as fetchSledCatalogIcon,
  getCatalogIconCacheBatch,
  resolveCatalogEntry,
  setCatalogIconCache as persistSledCatalogIcon,
} from "../../app/services/catalogService";
import { getTexturePreview, getTexturePreviewsBatch } from "../../app/services/textureService";
import { throwIfAborted } from "../../ipc/abortable";
import { getThumbnailCache, thumbnailCacheKey } from "../explorer/thumbnailCache";
import {
  catalogIconCacheKey,
  clearCatalogIconFailure,
  clearCatalogIconInflight,
  getCatalogIconCache,
  markCatalogIconInflight,
  setCatalogIconFailure,
  setCatalogIconProgress,
  type CatalogIconTier,
} from "./catalogIconCache";
import {
  type CatalogIconMode,
  shouldBakeTier1,
  shouldUpgradeTo3d,
} from "./catalogIconRules";

export type { CatalogIconMode, CatalogIconBakePriority } from "./catalogIconRules";
export {
  shouldAttemptIconBake,
  shouldBakeTier1,
  shouldUpgradeTo3d,
} from "./catalogIconRules";

const THUMB_PIXEL_SIZE = 48;
const ICON_LOW_RES = 24;
const ICON_PIXEL_SIZE = 48;
const MAX_INFLIGHT = 3;
const ICON_BAKE_TIMEOUT_MS = 8_000;
const TIER1_BATCH_MIN = 2;
const MAX_TIER1_PREVIEW_ENTRIES = 512;
const MAX_SLED_PREFETCH_ENTRIES = 1024;
const MAX_SLED_BATCH = 128;
const MAX_TEXTURE_PREVIEW_BATCH = 256;

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length <= chunkSize) return items.length ? [items] : [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/** IPC preview bytes keyed by `${handleId}:${texturePath}` — filled by batch prefetch (APP-010). */
const tier1PreviewByPath = new Map<string, string>();
/** Tier-2 sled hits keyed by `${handleId}:${iconKey}` — filled by batch prefetch (CAT-005). */
const sledIconPrefetch = new Map<string, string | null>();
let tier1BatchInflight: Promise<void> | null = null;

export type IconBakePriority = "selected" | "visible" | "prefetch";

const PRIORITY_RANK: Record<IconBakePriority, number> = {
  selected: 0,
  visible: 1,
  prefetch: 2,
};

const inflight = new Set<string>();
const runningKeys = new Set<string>();
interface QueuedTask {
  priority: number;
  key: string;
  generation: number;
  run: (signal: AbortSignal) => Promise<void>;
}
const queue: QueuedTask[] = [];
let activeWorkers = 0;
let pipelineGeneration = 0;
const taskAbortControllers = new Map<string, AbortController>();
let iconPrefetchAbort: AbortController | null = null;

function abortIconPipelineIpc(): void {
  iconPrefetchAbort?.abort();
  iconPrefetchAbort = null;
  for (const ctrl of taskAbortControllers.values()) {
    ctrl.abort();
  }
  taskAbortControllers.clear();
}

/** Abort in-flight tier-1 / sled prefetch IPC without resetting the bake queue. */
export function abortCatalogIconPrefetches(): void {
  iconPrefetchAbort?.abort();
  iconPrefetchAbort = null;
}

type IconRendererModule = typeof import("./CatalogIconRenderer");

let iconRendererModule: IconRendererModule | null = null;

async function loadIconRenderer(): Promise<IconRendererModule> {
  if (!iconRendererModule) {
    iconRendererModule = await import("./CatalogIconRenderer");
  }
  return iconRendererModule;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Icon bake timeout")), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function tier1PreviewKey(handleId: number, texturePath: string): string {
  return `${handleId}:${texturePath}`;
}

function sledPrefetchKey(handleId: number, iconKey: string): string {
  return `${handleId}:${iconKey}`;
}

function storeTier1Preview(key: string, value: string): void {
  if (tier1PreviewByPath.size >= MAX_TIER1_PREVIEW_ENTRIES) {
    const oldest = tier1PreviewByPath.keys().next().value;
    if (oldest) tier1PreviewByPath.delete(oldest);
  }
  tier1PreviewByPath.set(key, value);
}

function storeSledPrefetch(handleId: number, iconKey: string, pngBase64: string | null): void {
  const key = sledPrefetchKey(handleId, iconKey);
  if (sledIconPrefetch.size >= MAX_SLED_PREFETCH_ENTRIES) {
    const oldest = sledIconPrefetch.keys().next().value;
    if (oldest) sledIconPrefetch.delete(oldest);
  }
  sledIconPrefetch.set(key, pngBase64);
}

async function prefetchSledIcons(
  handle: ProjectHandle,
  iconKeys: string[],
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const missing = [
    ...new Set(
      iconKeys.filter((iconKey) => !sledIconPrefetch.has(sledPrefetchKey(handle.id, iconKey))),
    ),
  ];
  if (missing.length === 0) return;
  try {
    for (const chunk of chunkArray(missing, MAX_SLED_BATCH)) {
      throwIfAborted(signal);
      const batch = await getCatalogIconCacheBatch(handle, chunk, { signal });
      const returned = new Set<string>();
      for (const item of batch) {
        returned.add(item.iconKey);
        storeSledPrefetch(handle.id, item.iconKey, item.pngBase64);
      }
      for (const iconKey of chunk) {
        if (!returned.has(iconKey)) {
          storeSledPrefetch(handle.id, iconKey, null);
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) return;
    console.warn("[catalogIconPipeline] sled icon batch prefetch failed", error);
  }
}

async function prefetchTier1TexturePreviews(
  handle: ProjectHandle,
  texturePaths: string[],
  cacheLimit: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const thumbCache = getThumbnailCache(cacheLimit);
  const missing = [
    ...new Set(
      texturePaths.filter((path) => {
        const thumbKey = thumbnailCacheKey(handle.id, path);
        const batchKey = tier1PreviewKey(handle.id, path);
        return !thumbCache.get(thumbKey) && !tier1PreviewByPath.has(batchKey);
      }),
    ),
  ];
  if (missing.length < TIER1_BATCH_MIN) return;

  const chunks = chunkArray(missing, MAX_TEXTURE_PREVIEW_BATCH);
  const inflight = (async () => {
    for (const chunk of chunks) {
      throwIfAborted(signal);
      const previews = await getTexturePreviewsBatch(handle, chunk, THUMB_PIXEL_SIZE, {
        signal,
      });
      for (const [path, preview] of previews) {
        storeTier1Preview(tier1PreviewKey(handle.id, path), preview.pngBase64);
      }
    }
  })()
    .catch((error) => {
      if (signal?.aborted) return;
      console.warn("[catalogIconPipeline] tier-1 preview batch failed", error);
    })
    .finally(() => {
      if (tier1BatchInflight === inflight) tier1BatchInflight = null;
    });
  tier1BatchInflight = inflight;
  await inflight;
}

export async function bakeTier1Preview(
  handle: ProjectHandle,
  texturePath: string,
  cacheLimit: number,
  signal?: AbortSignal,
): Promise<{ url: string | null; error?: string }> {
  throwIfAborted(signal);
  const thumbKey = thumbnailCacheKey(handle.id, texturePath);
  const thumbCache = getThumbnailCache(cacheLimit);
  let dataUrl = thumbCache.get(thumbKey);

  if (!dataUrl) {
    try {
      if (tier1BatchInflight) {
        await tier1BatchInflight.catch(() => {});
      }
      const batchKey = tier1PreviewKey(handle.id, texturePath);
      let pngBase64 = tier1PreviewByPath.get(batchKey);
      if (pngBase64) {
        tier1PreviewByPath.delete(batchKey);
      } else {
        const preview = await getTexturePreview(handle, texturePath, THUMB_PIXEL_SIZE, {
          signal,
        });
        pngBase64 = preview.pngBase64;
      }
      const { bakeCatalogIconFromPreviewAsync } = await loadIconRenderer();
      const url = await bakeCatalogIconFromPreviewAsync(pngBase64, ICON_PIXEL_SIZE);
      if (!url) return { url: null, error: "Preview icon bake returned empty" };
      dataUrl = url;
      thumbCache.set(thumbKey, dataUrl);
      return { url: dataUrl };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Texture preview failed";
      return { url: null, error: message };
    }
  }

  const base64 = dataUrl.split(",")[1];
  if (!base64) return { url: dataUrl };
  try {
    const { bakeCatalogIconFromPreviewAsync } = await loadIconRenderer();
    const url = await bakeCatalogIconFromPreviewAsync(base64, ICON_PIXEL_SIZE);
    return { url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Icon bake failed";
    return { url: null, error: message };
  }
}

export interface IconBakeBatch {
  entries: CatalogEntry[];
  priority: IconBakePriority;
}

export function scheduleCatalogIconBakes(
  batches: IconBakeBatch[],
  handle: ProjectHandle,
  mode: CatalogIconMode,
  iconCacheLimit: number,
  textureCacheLimit: number,
): void {
  const sorted = [...batches].sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );

  abortCatalogIconPrefetches();
  const prefetchAbort = new AbortController();
  iconPrefetchAbort = prefetchAbort;
  const prefetchSignal = prefetchAbort.signal;

  const tier1Paths: string[] = [];
  for (const batch of sorted) {
    for (const entry of batch.entries) {
      const wants3d = shouldUpgradeTo3d(entry, mode, batch.priority);
      const wantsTier1Only =
        shouldBakeTier1(entry, mode, batch.priority) && !wants3d;
      if (!wants3d && !wantsTier1Only) continue;
      const texturePath = entry.texturePaths[0];
      if (texturePath) tier1Paths.push(texturePath);
    }
  }
  void prefetchTier1TexturePreviews(handle, tier1Paths, textureCacheLimit, prefetchSignal);

  const sledKeys: string[] = [];
  for (const batch of sorted) {
    for (const entry of batch.entries) {
      const key = catalogIconCacheKey(handle.id, entry.iconKey);
      const cached = getCatalogIconCache(iconCacheLimit).get(key);
      if (cached?.tier === 2) continue;
      const wants3d = shouldUpgradeTo3d(entry, mode, batch.priority);
      const wantsTier1Only =
        shouldBakeTier1(entry, mode, batch.priority) && !wants3d;
      if (wants3d || wantsTier1Only) sledKeys.push(entry.iconKey);
    }
  }
  void prefetchSledIcons(handle, sledKeys, prefetchSignal);

  for (const batch of sorted) {
    for (const entry of batch.entries) {
      const key = catalogIconCacheKey(handle.id, entry.iconKey);
      const cached = getCatalogIconCache(iconCacheLimit).get(key);
      if (cached?.tier === 2) continue;
      if (inflight.has(key)) continue;

      const wants3d = shouldUpgradeTo3d(entry, mode, batch.priority);
      const wantsTier1Only =
        shouldBakeTier1(entry, mode, batch.priority) && !wants3d;
      if (!wants3d && !wantsTier1Only) continue;

      inflight.add(key);
      markCatalogIconInflight(key);
      const generation = pipelineGeneration;
      enqueue(PRIORITY_RANK[batch.priority], key, generation, async (signal) => {
        try {
          await bakeCatalogIconForEntry(
            entry,
            handle,
            mode,
            batch.priority,
            iconCacheLimit,
            textureCacheLimit,
            generation,
            signal,
          );
        } finally {
          inflight.delete(key);
          if (generation === pipelineGeneration) {
            clearCatalogIconInflight(key);
          }
        }
      });
    }
  }
}

/** @deprecated Use scheduleCatalogIconBakes with batches — kept for tests. */
export function scheduleCatalogIconBakesFlat(
  entries: CatalogEntry[],
  handle: ProjectHandle,
  mode: CatalogIconMode,
  iconCacheLimit: number,
  textureCacheLimit: number,
): void {
  scheduleCatalogIconBakes(
    [{ entries, priority: "visible" }],
    handle,
    mode,
    iconCacheLimit,
    textureCacheLimit,
  );
}

async function loadSledIcon(
  handle: ProjectHandle,
  iconKey: string,
): Promise<string | null> {
  const prefKey = sledPrefetchKey(handle.id, iconKey);
  if (sledIconPrefetch.has(prefKey)) {
    const base64 = sledIconPrefetch.get(prefKey);
    return base64 ? `data:image/png;base64,${base64}` : null;
  }
  try {
    const base64 = await fetchSledCatalogIcon(handle, iconKey);
    storeSledPrefetch(handle.id, iconKey, base64);
    if (!base64) return null;
    return `data:image/png;base64,${base64}`;
  } catch (error) {
    console.warn("[catalogIconPipeline] sled icon read failed", iconKey, error);
    return null;
  }
}

async function persistSledIcon(
  handle: ProjectHandle,
  iconKey: string,
  dataUrl: string,
): Promise<void> {
  const base64 = dataUrl.split(",")[1];
  if (!base64) return;
  try {
    await persistSledCatalogIcon(handle, iconKey, base64);
  } catch (error) {
    console.warn("[catalogIconPipeline] sled icon write failed", iconKey, error);
  }
}

async function bakeCatalogIconForEntry(
  entry: CatalogEntry,
  handle: ProjectHandle,
  mode: CatalogIconMode,
  priority: IconBakePriority,
  iconCacheLimit: number,
  textureCacheLimit: number,
  generation: number,
  signal?: AbortSignal,
): Promise<void> {
  throwIfAborted(signal);
  const key = catalogIconCacheKey(handle.id, entry.iconKey);
  const cache = getCatalogIconCache(iconCacheLimit);
  const errors: string[] = [];
  const stale = () => generation !== pipelineGeneration;

  const write = (url: string | null, tier: CatalogIconTier) => {
    if (stale() || !url) return false;
    const existing = cache.get(key);
    if (existing && existing.tier > tier) return true;
    cache.set(key, { url, tier });
    clearCatalogIconFailure(key);
    setCatalogIconProgress(key, tier === 2 ? "final" : "low");
    if (tier === 2) {
      void persistSledIcon(handle, entry.iconKey, url);
    }
    if (typeof performance !== "undefined") {
      performance.mark(`catalog-icon-ready:${entry.iconKey}`);
    }
    return true;
  };

  const sledHit = await loadSledIcon(handle, entry.iconKey);
  if (stale()) return;
  if (sledHit && write(sledHit, 2)) return;

  if (shouldUpgradeTo3d(entry, mode, priority)) {
    let model: RenderableModel | null = null;
    try {
      model = await resolveCatalogEntry(handle, entry.id, "icon", null, { signal });
    } catch (error) {
      if (signal?.aborted) return;
      const message = error instanceof Error ? error.message : "Model resolve failed";
      errors.push(message);
    }
    if (stale()) return;

    if (model) {
      const low = await bakeTier2FromModel(model, handle, ICON_LOW_RES);
      if (stale()) return;
      if (low.url) write(low.url, 1);

      const tier2 = await bakeTier2FromModel(model, handle, ICON_PIXEL_SIZE);
      if (stale()) return;
      if (tier2.url && write(tier2.url, 2)) return;
      if (tier2.error) errors.push(tier2.error);
    }

    const texturePath = entry.texturePaths[0];
    if (texturePath) {
      const tier1 = await bakeTier1Preview(handle, texturePath, textureCacheLimit, signal);
      if (stale()) return;
      if (tier1.url && write(tier1.url, 1)) return;
      if (tier1.error) errors.push(tier1.error);
    }
  } else if (shouldBakeTier1(entry, mode, priority)) {
    const texturePath = entry.texturePaths[0];
    if (texturePath) {
      const tier1 = await bakeTier1Preview(handle, texturePath, textureCacheLimit, signal);
      if (stale()) return;
      if (tier1.url && write(tier1.url, 1)) return;
      if (tier1.error) errors.push(tier1.error);
    }
  }

  if (!stale() && errors.length > 0) {
    setCatalogIconFailure(key, `Icon bake failed: ${errors[0]}`);
  }
}

async function bakeTier2FromModel(
  model: RenderableModel,
  handle: ProjectHandle,
  size: number,
): Promise<{ url: string | null; error?: string }> {
  try {
    const { bakeCatalogIcon3d } = await loadIconRenderer();
    const url = await withTimeout(
      bakeCatalogIcon3d(model, handle, size),
      ICON_BAKE_TIMEOUT_MS,
    );
    if (!url) return { url: null, error: "3D icon bake returned empty" };
    return { url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "3D icon bake failed";
    return { url: null, error: message };
  }
}

function compareQueuedTasks(a: QueuedTask, b: QueuedTask): number {
  return a.priority - b.priority || a.key.localeCompare(b.key);
}

function enqueue(
  priority: number,
  key: string,
  generation: number,
  task: (signal: AbortSignal) => Promise<void>,
): void {
  const taskAbort = new AbortController();
  taskAbortControllers.set(key, taskAbort);
  const item: QueuedTask = {
    priority,
    key,
    generation,
    run: (signal) => task(signal),
  };
  let lo = 0;
  let hi = queue.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareQueuedTasks(queue[mid]!, item) <= 0) lo = mid + 1;
    else hi = mid;
  }
  queue.splice(lo, 0, item);
  void pumpQueue();
}

async function pumpQueue(): Promise<void> {
  while (activeWorkers < MAX_INFLIGHT && queue.length > 0) {
    const task = queue.shift();
    if (!task) break;
    if (task.generation !== pipelineGeneration) continue;
    activeWorkers++;
    runningKeys.add(task.key);
    const taskAbort = taskAbortControllers.get(task.key);
    const signal = taskAbort?.signal ?? new AbortController().signal;
    void task
      .run(signal)
      .finally(() => {
        taskAbortControllers.delete(task.key);
        runningKeys.delete(task.key);
        activeWorkers--;
        void pumpQueue();
      });
  }
}

export function resetCatalogIconPipeline(): void {
  abortIconPipelineIpc();
  pipelineGeneration += 1;
  queue.length = 0;
  runningKeys.clear();
  tier1PreviewByPath.clear();
  sledIconPrefetch.clear();
  tier1BatchInflight = null;
  for (const key of inflight) {
    clearCatalogIconInflight(key);
  }
  inflight.clear();
  void loadIconRenderer().then((renderer) => renderer.disposeCatalogIconRenderer());
}

export function getCatalogIconQueueDepth(): number {
  return queue.length + inflight.size;
}

/** Drop queued prefetch/visible bakes that are no longer on screen (never abort running work). */
export function cancelInvisibleIconBakes(keepKeys: Set<string>): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    const task = queue[i];
    if (!task) continue;
    if (task.priority <= PRIORITY_RANK.selected) continue;
    if (keepKeys.has(task.key)) continue;
    queue.splice(i, 1);
    const stillQueued = queue.some((queued) => queued.key === task.key);
    if (!stillQueued && !runningKeys.has(task.key) && inflight.has(task.key)) {
      inflight.delete(task.key);
      clearCatalogIconInflight(task.key);
    }
  }
}
