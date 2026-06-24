import { useEffect } from "react";

import { ipc } from "../../ipc/client";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { getThumbnailCache, isThumbnailInflight, thumbnailCacheKey, trackThumbnailBatch } from "./thumbnailCache";

const BATCH_SIZE = 32;
const THUMB_PIXEL_SIZE = 48;

/** Prefetch texture previews for visible explorer rows into the LRU cache. */
export function useThumbnailBatchPrefetch(visibleTexturePaths: string[]) {
  const handle = useProjectStore((s) => s.handle);
  const cacheLimit = useSettingsStore((s) => s.textureCacheLimit);

  useEffect(() => {
    if (!handle || !visibleTexturePaths.length) return;

    const cache = getThumbnailCache(cacheLimit);
    const missing = visibleTexturePaths.filter((path) => {
      const key = thumbnailCacheKey(handle.id, path);
      return !cache.get(key) && !isThumbnailInflight(key);
    });
    if (!missing.length) return;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const chunk = missing.slice(i, i + BATCH_SIZE);
      const keys = chunk.map((path) => thumbnailCacheKey(handle.id, path));

      const batch = ipc
        .getTexturePreviewsBatch(handle, chunk, THUMB_PIXEL_SIZE)
        .then((items) => {
          for (const item of items) {
            if (item.preview) {
              const key = thumbnailCacheKey(handle.id, item.path);
              cache.set(key, `data:image/png;base64,${item.preview.pngBase64}`);
            }
          }
        });

      trackThumbnailBatch(keys, cache, batch);
    }
  }, [handle, visibleTexturePaths, cacheLimit]);
}
