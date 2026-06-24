import { useEffect, useRef, useSyncExternalStore } from "react";

import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import {
  getCatalogIconPendingCount as getCacheInflightCount,
  readCatalogIconState,
  subscribeCatalogIconCache,
  type CatalogIconState,
} from "./catalogIconCache";
import {
  getCatalogIconQueueDepth,
  scheduleCatalogIconBakes,
} from "./catalogIconPipeline";

/** Schedule tier-1/tier-2 icon bakes for visible catalog cells. */
export function useCatalogIconPipeline(visibleEntries: CatalogEntry[]) {
  const handle = useProjectStore((s) => s.handle);
  const mode = useSettingsStore((s) => s.catalogIconMode);
  const iconCacheLimit = useSettingsStore((s) => s.catalogIconCacheLimit);
  const textureCacheLimit = useSettingsStore((s) => s.textureCacheLimit);
  const signatureRef = useRef("");

  useEffect(() => {
    if (!handle || !visibleEntries.length) return;

    const signature = visibleEntries.map((e) => e.iconKey).join("|");
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;

    scheduleCatalogIconBakes(
      visibleEntries,
      handle,
      mode,
      iconCacheLimit,
      textureCacheLimit,
    );
  }, [handle, visibleEntries, mode, iconCacheLimit, textureCacheLimit]);
}

export function useCatalogIconSrc(
  handleId: number | undefined,
  iconKey: string,
): string | null {
  const limit = useSettingsStore((s) => s.catalogIconCacheLimit);
  return useSyncExternalStore(
    subscribeCatalogIconCache,
    () => readCatalogIconState(handleId, iconKey, limit).src,
    () => null,
  );
}

export function useCatalogIconStatus(
  handleId: number | undefined,
  iconKey: string,
): CatalogIconState {
  const limit = useSettingsStore((s) => s.catalogIconCacheLimit);
  return useSyncExternalStore(
    subscribeCatalogIconCache,
    () => readCatalogIconState(handleId, iconKey, limit),
    () => ({ src: null, status: "idle", error: null }),
  );
}

/** Pending icon bake count for catalog panel header. */
export function useCatalogIconPendingCount(): number {
  return useSyncExternalStore(
    subscribeCatalogIconCache,
    () => getCacheInflightCount() + getCatalogIconQueueDepth(),
    () => 0,
  );
}
