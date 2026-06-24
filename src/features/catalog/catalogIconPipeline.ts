import type { CatalogEntry, ProjectHandle } from "../../ipc/types";
import {
  getCatalogIconCache as fetchSledCatalogIcon,
  resolveCatalogEntry,
  setCatalogIconCache as persistSledCatalogIcon,
} from "../../app/services/catalogService";
import { getTexturePreview } from "../../app/services/textureService";
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

export type IconBakePriority = "selected" | "visible" | "prefetch";

const PRIORITY_RANK: Record<IconBakePriority, number> = {
  selected: 0,
  visible: 1,
  prefetch: 2,
};

const inflight = new Set<string>();
interface QueuedTask {
  priority: number;
  key: string;
  run: () => Promise<void>;
}
const queue: QueuedTask[] = [];
let activeWorkers = 0;

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
      const preview = await getTexturePreview(handle, texturePath, THUMB_PIXEL_SIZE);
      dataUrl = `data:image/png;base64,${preview.pngBase64}`;
      thumbCache.set(thumbKey, dataUrl);
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
      enqueue(PRIORITY_RANK[batch.priority], key, async () => {
        try {
          await bakeCatalogIconForEntry(
            entry,
            handle,
            mode,
            iconCacheLimit,
            textureCacheLimit,
          );
        } finally {
          inflight.delete(key);
          clearCatalogIconInflight(key);
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
  } catch {
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
  } catch {
    // non-fatal
  }
}

async function bakeCatalogIconForEntry(
  entry: CatalogEntry,
  handle: ProjectHandle,
  mode: CatalogIconMode,
  iconCacheLimit: number,
  textureCacheLimit: number,
): Promise<void> {
  const key = catalogIconCacheKey(handle.id, entry.iconKey);
  const cache = getCatalogIconCache(iconCacheLimit);
  const errors: string[] = [];

  const write = (url: string | null, tier: CatalogIconTier) => {
    if (!url) return false;
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
  if (sledHit && write(sledHit, 2)) return;

  if (shouldUpgradeTo3d(entry, mode)) {
    const low = await bakeTier2Gui(handle, entry.id, ICON_LOW_RES);
    if (low.url) write(low.url, 1);

    const tier2 = await bakeTier2Gui(handle, entry.id, ICON_PIXEL_SIZE);
    if (tier2.url && write(tier2.url, 2)) return;
    if (tier2.error) errors.push(tier2.error);

    const texturePath = entry.texturePaths[0];
    if (texturePath) {
      const tier1 = await bakeTier1Preview(handle, texturePath, textureCacheLimit);
      if (tier1.url && write(tier1.url, 1)) return;
      if (tier1.error) errors.push(tier1.error);
    }
  } else if (shouldBakeTier1(entry, mode)) {
    const texturePath = entry.texturePaths[0];
    if (texturePath) {
      const tier1 = await bakeTier1Preview(handle, texturePath, textureCacheLimit);
      if (tier1.url && write(tier1.url, 1)) return;
      if (tier1.error) errors.push(tier1.error);
    }
  }

  if (errors.length > 0) {
    setCatalogIconFailure(key, `Icon bake failed: ${errors[0]}`);
  }
}

async function bakeTier2Gui(
  handle: ProjectHandle,
  entryId: string,
  size: number,
): Promise<{ url: string | null; error?: string }> {
  try {
    const model = await resolveCatalogEntry(handle, entryId, "icon");
    const { bakeCatalogIcon3d } = await loadIconRenderer();
    const url = await withTimeout(
      bakeCatalogIcon3d(model, handle, size),
      ICON_BAKE_TIMEOUT_MS,
    );
    if (!url) return { url: null, error: "3D icon bake returned empty" };
    return { url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model resolve failed";
    return { url: null, error: message };
  }
}

function compareQueuedTasks(a: QueuedTask, b: QueuedTask): number {
  return a.priority - b.priority || a.key.localeCompare(b.key);
}

function enqueue(priority: number, key: string, task: () => Promise<void>): void {
  const item: QueuedTask = { priority, key, run: task };
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
    activeWorkers++;
    void task.run().finally(() => {
      activeWorkers--;
      void pumpQueue();
    });
  }
}

export function resetCatalogIconPipeline(): void {
  queue.length = 0;
  inflight.clear();
  activeWorkers = 0;
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
    if (inflight.has(task.key)) {
      inflight.delete(task.key);
      clearCatalogIconInflight(task.key);
    }
  }
}
