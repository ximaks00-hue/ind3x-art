import type { CatalogEntry, ProjectHandle } from "../../ipc/types";
import { resolveCatalogEntry } from "../../app/services/catalogService";
import { ipc } from "../../ipc/client";
import { getThumbnailCache, thumbnailCacheKey } from "../explorer/thumbnailCache";
import {
  bakeCatalogIcon3d,
  bakeCatalogIconFromPreviewAsync,
  disposeCatalogIconRenderer,
} from "./CatalogIconRenderer";
import {
  catalogIconCacheKey,
  clearCatalogIconFailure,
  clearCatalogIconInflight,
  getCatalogIconCache,
  markCatalogIconInflight,
  setCatalogIconFailure,
  type CatalogIconTier,
} from "./catalogIconCache";

export type CatalogIconMode = "auto" | "preview" | "3d";

const THUMB_PIXEL_SIZE = 48;
const ICON_PIXEL_SIZE = 48;
const MAX_INFLIGHT = 3;

const inflight = new Set<string>();
const queue: Array<() => Promise<void>> = [];
let activeWorkers = 0;

/** Items and texture-less entries get tier-2 GUI bake in auto mode. */
export function shouldUpgradeTo3d(entry: CatalogEntry, mode: CatalogIconMode): boolean {
  if (mode === "preview") return false;
  if (mode === "3d") return true;
  return entry.kind === "item" || entry.texturePaths.length === 0;
}

export function shouldBakeTier1(entry: CatalogEntry, mode: CatalogIconMode): boolean {
  if (mode === "3d") return false;
  return Boolean(entry.texturePaths[0]);
}

export function shouldAttemptIconBake(entry: CatalogEntry, mode: CatalogIconMode): boolean {
  return shouldBakeTier1(entry, mode) || shouldUpgradeTo3d(entry, mode);
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
      const preview = await ipc.getTexturePreview(handle, texturePath, THUMB_PIXEL_SIZE);
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
    const url = await bakeCatalogIconFromPreviewAsync(base64, ICON_PIXEL_SIZE);
    return { url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Icon bake failed";
    return { url: null, error: message };
  }
}

export function scheduleCatalogIconBakes(
  entries: CatalogEntry[],
  handle: ProjectHandle,
  mode: CatalogIconMode,
  iconCacheLimit: number,
  textureCacheLimit: number,
): void {
  for (const entry of entries) {
    const key = catalogIconCacheKey(handle.id, entry.iconKey);
    const cached = getCatalogIconCache(iconCacheLimit).get(key);
    if (cached?.tier === 2) continue;
    if (inflight.has(key)) continue;

    const needsTier1 = shouldBakeTier1(entry, mode) && !cached;
    const needsTier2 = shouldUpgradeTo3d(entry, mode) && (!cached || cached.tier < 2);
    if (!needsTier1 && !needsTier2) continue;

    inflight.add(key);
    markCatalogIconInflight(key);
    enqueue(async () => {
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
    if (typeof performance !== "undefined") {
      performance.mark(`catalog-icon-ready:${entry.iconKey}`);
    }
    return true;
  };

  if (mode === "3d") {
    const tier2 = await bakeTier2Gui(handle, entry.id);
    if (tier2.url && write(tier2.url, 2)) return;
    if (tier2.error) errors.push(tier2.error);
    const texturePath = entry.texturePaths[0];
    if (texturePath) {
      const tier1 = await bakeTier1Preview(handle, texturePath, textureCacheLimit);
      if (tier1.url && write(tier1.url, 1)) return;
      if (tier1.error) errors.push(tier1.error);
    }
    if (errors.length > 0) {
      setCatalogIconFailure(key, `Icon bake failed: ${errors[0]}`);
    }
    return;
  }

  if (shouldBakeTier1(entry, mode)) {
    const texturePath = entry.texturePaths[0]!;
    const tier1 = await bakeTier1Preview(handle, texturePath, textureCacheLimit);
    if (tier1.url && write(tier1.url, 1) && !shouldUpgradeTo3d(entry, mode)) return;
    if (tier1.error) errors.push(tier1.error);
  }

  if (shouldUpgradeTo3d(entry, mode)) {
    const tier2 = await bakeTier2Gui(handle, entry.id);
    if (tier2.url && write(tier2.url, 2)) return;
    if (tier2.error) errors.push(tier2.error);
  }

  if (errors.length > 0) {
    setCatalogIconFailure(key, `Icon bake failed: ${errors[0]}`);
  }
}

async function bakeTier2Gui(
  handle: ProjectHandle,
  entryId: string,
): Promise<{ url: string | null; error?: string }> {
  try {
    const model = await resolveCatalogEntry(handle, entryId);
    const url = await bakeCatalogIcon3d(model, handle, ICON_PIXEL_SIZE);
    if (!url) return { url: null, error: "3D icon bake returned empty" };
    return { url };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model resolve failed";
    return { url: null, error: message };
  }
}

function enqueue(task: () => Promise<void>): void {
  queue.push(task);
  void pumpQueue();
}

async function pumpQueue(): Promise<void> {
  while (activeWorkers < MAX_INFLIGHT && queue.length > 0) {
    const task = queue.shift();
    if (!task) break;
    activeWorkers++;
    void task().finally(() => {
      activeWorkers--;
      void pumpQueue();
    });
  }
}

export function resetCatalogIconPipeline(): void {
  queue.length = 0;
  inflight.clear();
  disposeCatalogIconRenderer();
}

export function getCatalogIconQueueDepth(): number {
  return queue.length + inflight.size;
}
