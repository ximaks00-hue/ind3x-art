import { setTextureDocumentCacheLimit } from "../features/editor/documentStore";
import { getThumbnailCache } from "../features/explorer/thumbnailCache";
import { setViewerTextureCacheLimit } from "../features/viewer3d/textureLoader";
import { clampTextureCacheLimit } from "./cacheLimits";
import { useSettingsStore } from "./settingsStore";

/** Apply persisted texture cache limit to runtime LRU caches (thumbnails, viewer, editor). */
export function syncTextureCacheLimitsFromSettings(): void {
  const limit = clampTextureCacheLimit(useSettingsStore.getState().textureCacheLimit);
  getThumbnailCache(limit);
  setViewerTextureCacheLimit(limit);
  setTextureDocumentCacheLimit(limit);
}

/** Re-sync cache limits after settings persist hydration. */
export function subscribeTextureCacheLimitSync(): () => void {
  return useSettingsStore.subscribe((state, prev) => {
    if (state.textureCacheLimit !== prev.textureCacheLimit) {
      syncTextureCacheLimitsFromSettings();
    }
  });
}
