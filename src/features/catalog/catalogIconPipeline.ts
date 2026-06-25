import type { CatalogEntry, ProjectHandle, RenderableModel } from "../../ipc/types";
import {
  getCatalogIconCache as fetchSledCatalogIcon,
  resolveCatalogEntry,
  setCatalogIconCache as persistSledCatalogIcon,
} from "../../app/services/catalogService";
import { getTexturePreview, getTexturePreviewsBatch } from "../../app/services/textureService";
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

export type { CatalogIconMode } from "./catalogIconRules";
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

/** IPC preview bytes keyed by `${handleId}:${texturePath}` — filled by batch prefetch (APP-010). */
const tier1PreviewByPath = new Map<string, string>();
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
  run: () => Promise<void>;
}
const queue: QueuedTask[] = [];
let activeWorkers = 0;
let pipelineGeneration = 0;

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

async function prefetchTier1TexturePreviews(
  handle: ProjectHandle,
  texturePaths: string[],
  cacheLimit: number,
): Promise<void> {
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

  const inflight = getTexturePreviewsBatch(handle, missing, THUMB_PIXEL_SIZE)
    .then((previews) => {
      for (const [path, preview] of previews) {
        tier1PreviewByPath.set(tier1PreviewKey(handle.id, path), preview.pngBase64);
      }
    })
    .catch((error) => {
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
): Promise<{ url: string | null; error?: string }> {
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
        const preview = await getTexturePreview(handle, texturePath, THUMB_PIXEL_SIZE);
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

  const tier1Paths: string[] = [];
  for (const batch of sorted) {
    for (const entry of batch.entries) {
      const wants3d = shouldUpgradeTo3d(entry, mode);
      const wantsTier1Only = shouldBakeTier1(entry, mode) && !wants3d;
      if (!wants3d && !wantsTier1Only) continue;
      const texturePath = entry.texturePaths[0];
      if (texturePath) tier1Paths.push(texturePath);
    }
  }
  void prefetchTier1TexturePreviews(handle, tier1Paths, textureCacheLimit);

  for (const batch of sorted) {
    for (const entry of batch.entries) {
      const key = catalogIconCacheKey(handle.id, entry.iconKey);
      const cached = getCatalogIconCache(iconCacheLimit).get(key);
      if (cached?.tier === 2) continue;
      if (inflight.has(key)) continue;

      const wants3d = shouldUpgradeTo3d(entry, mode);
      const wantsTier1Only = shouldBakeTier1(entry, mode) && !wants3d;
      if (!wants3d && !wantsTier1Only) continue;

      inflight.add(key);
      markCatalogIconInflight(key);
      const generation = pipelineGeneration;
      enqueue(PRIORITY_RANK[batch.priority], key, generation, async () => {
        try {
          await bakeCatalogIconForEntry(
            entry,
            handle,
            mode,
            iconCacheLimit,
            textureCacheLimit,
            generation,
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
  try {
    const base64 = await fetchSledCatalogIcon(handle, iconKey);
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
  iconCacheLimit: number,
  textureCacheLimit: number,
  generation: number,
): Promise<void> {
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

  if (shouldUpgradeTo3d(entry, mode)) {
    let model: RenderableModel | null = null;
    try {
      model = await resolveCatalogEntry(handle, entry.id, "icon");
    } catch (error) {
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
      const tier1 = await bakeTier1Preview(handle, texturePath, textureCacheLimit);
      if (stale()) return;
      if (tier1.url && write(tier1.url, 1)) return;
      if (tier1.error) errors.push(tier1.error);
    }
  } else if (shouldBakeTier1(entry, mode)) {
    const texturePath = entry.texturePaths[0];
    if (texturePath) {
      const tier1 = await bakeTier1Preview(handle, texturePath, textureCacheLimit);
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
  task: () => Promise<void>,
): void {
  const item: QueuedTask = { priority, key, generation, run: task };
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
    void task
      .run()
      .finally(() => {
        runningKeys.delete(task.key);
        activeWorkers--;
        void pumpQueue();
      });
  }
}

export function resetCatalogIconPipeline(): void {
  pipelineGeneration += 1;
  queue.length = 0;
  runningKeys.clear();
  tier1PreviewByPath.clear();
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

/** Drop queued prefetch/visible bakes that are no longer on screen. */
export function cancelInvisibleIconBakes(keepKeys: Set<string>): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    const task = queue[i];
    if (!task) continue;
    if (task.priority <= PRIORITY_RANK.selected) continue;
    if (keepKeys.has(task.key)) continue;
    queue.splice(i, 1);
    if (runningKeys.has(task.key)) continue;
    const stillQueued = queue.some((queued) => queued.key === task.key);
    if (!stillQueued && inflight.has(task.key)) {
      inflight.delete(task.key);
      clearCatalogIconInflight(task.key);
    }
  }
}
