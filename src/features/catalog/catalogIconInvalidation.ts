import {
  invalidateCatalogIconsForTextures as fetchInvalidatedCatalogIconKeys,
} from "../../app/services/catalogService";
import type { ProjectHandle } from "../../ipc/types";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import {
  catalogIconCacheKey,
  clearCatalogIconFailure,
  clearCatalogIconInflight,
  getCatalogIconCache,
} from "./catalogIconCache";
import { useCatalogStore } from "./catalogStore";

function clearMemoryIconsForTextures(
  handle: ProjectHandle,
  texturePaths: string[],
  limit: number,
): void {
  const textureSet = new Set(texturePaths);
  const cache = getCatalogIconCache(limit);
  for (const entry of useCatalogStore.getState().entries) {
    if (!entry.texturePaths.some((path) => textureSet.has(path))) continue;
    const key = catalogIconCacheKey(handle.id, entry.iconKey);
    cache.delete(key);
    clearCatalogIconInflight(key);
    clearCatalogIconFailure(key);
  }
}

/** Drop tier-1/2 memory cache and sled icon entries for catalog rows using these textures. */
export async function invalidateCatalogIconsForTextures(
  handle: ProjectHandle,
  texturePaths: string[],
): Promise<void> {
  if (texturePaths.length === 0) return;

  const limit = useSettingsStore.getState().catalogIconCacheLimit ?? 256;
  let iconKeys: string[] = [];
  try {
    iconKeys = await fetchInvalidatedCatalogIconKeys(handle, texturePaths);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Icon cache invalidation failed";
    console.warn("[catalogIconInvalidation] IPC failed; clearing memory cache optimistically", error);
    useUiStore.getState().pushToast(`Icon cache sync failed: ${message}`, "error");
    clearMemoryIconsForTextures(handle, texturePaths, limit);
    return;
  }

  const cache = getCatalogIconCache(limit);
  for (const iconKey of iconKeys) {
    const key = catalogIconCacheKey(handle.id, iconKey);
    cache.delete(key);
    clearCatalogIconInflight(key);
    clearCatalogIconFailure(key);
  }
}
