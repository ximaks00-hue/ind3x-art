import { useEffect, useRef } from "react";

import { ipc } from "../../ipc/client";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { getThumbnailCache } from "./thumbnailCache";

const BATCH_SIZE = 32;
const THUMB_PIXEL_SIZE = 48;

/** Prefetch texture previews for visible explorer rows into the LRU cache. */
export function useThumbnailBatchPrefetch(visibleTexturePaths: string[]) {
  const handle = useProjectStore((s) => s.handle);
  const cacheLimit = useSettingsStore((s) => s.textureCacheLimit);
  const inflight = useRef(new Set<string>());

  useEffect(() => {
    if (!handle || !visibleTexturePaths.length) return;

    const cache = getThumbnailCache(cacheLimit);
    const missing = visibleTexturePaths.filter(
      (path) => !cache.get(path) && !inflight.current.has(path),
    );
    if (!missing.length) return;

    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const chunk = missing.slice(i, i + BATCH_SIZE);
      for (const path of chunk) inflight.current.add(path);

      void ipc
        .getTexturePreviewsBatch(handle, chunk, THUMB_PIXEL_SIZE)
        .then((batch) => {
          for (const item of batch) {
            if (item.preview) {
              cache.set(item.path, `data:image/png;base64,${item.preview.pngBase64}`);
            }
          }
        })
        .finally(() => {
          for (const path of chunk) inflight.current.delete(path);
        });
    }
  }, [handle, visibleTexturePaths, cacheLimit]);
}
