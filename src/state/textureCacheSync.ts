import { setTextureDocumentCacheLimit } from "../features/editor/documentStore";
import { getThumbnailCache } from "../features/explorer/thumbnailCache";
import { setViewerTextureCacheLimit } from "../features/viewer3d/textureLoader";
import { useSettingsStore } from "./settingsStore";

/** Apply persisted texture cache limit to runtime LRU caches (thumbnails, viewer, editor). */
export function syncTextureCacheLimitsFromSettings(): void {
  const limit = useSettingsStore.getState().textureCacheLimit;
  getThumbnailCache(limit);
  setViewerTextureCacheLimit(limit);
  setTextureDocumentCacheLimit(limit);
}
