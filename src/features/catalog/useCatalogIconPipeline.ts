import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useCatalogStore } from "./catalogStore";
import {
  getCatalogIconPendingCount as getCacheInflightCount,
  readCatalogIconState,
  subscribeCatalogIconCache,
  type CatalogIconState,
} from "./catalogIconCache";
import {
  cancelInvisibleIconBakes,
  getCatalogIconQueueDepth,
  scheduleCatalogIconBakes,
  type IconBakeBatch,
} from "./catalogIconPipeline";
import { catalogIconCacheKey } from "./catalogIconCache";

const PREFETCH_RING = 36;

function prefetchEntries(
  entries: CatalogEntry[],
  visible: CatalogEntry[],
): CatalogEntry[] {
  const visibleKeys = new Set(visible.map((e) => e.iconKey));
  const start = visible.length > 0 ? entries.indexOf(visible[visible.length - 1]!) + 1 : 0;
  const ring: CatalogEntry[] = [];
  for (let i = start; i < entries.length && ring.length < PREFETCH_RING; i++) {
    const entry = entries[i];
    if (entry && !visibleKeys.has(entry.iconKey)) {
      ring.push(entry);
    }
  }
  return ring;
}

/** Schedule tier-2 icon bakes: selected → visible → prefetch ring. */
export function useCatalogIconPipeline(
  visibleEntries: CatalogEntry[],
  selectedId: string | null,
  allEntries: CatalogEntry[],
) {
  const handle = useProjectStore((s) => s.handle);
  const queryRevision = useCatalogStore((s) => s.queryRevision);
  const mode = useSettingsStore((s) => s.catalogIconMode);
  const iconCacheLimit = useSettingsStore((s) => s.catalogIconCacheLimit);
  const textureCacheLimit = useSettingsStore((s) => s.textureCacheLimit);
  const signatureRef = useRef("");

  const selectedEntry = useMemo(
    () => (selectedId ? allEntries.find((e) => e.id === selectedId) : undefined),
    [allEntries, selectedId],
  );

  const prefetch = useMemo(
    () => prefetchEntries(allEntries, visibleEntries),
    [allEntries, visibleEntries],
  );

  useEffect(() => {
    signatureRef.current = "";
  }, [handle?.id, queryRevision]);

  useEffect(() => {
    if (!handle || (!visibleEntries.length && !selectedEntry)) return;

    const signature = [
      handle.id,
      queryRevision,
      selectedId ?? "",
      visibleEntries.map((e) => e.iconKey).join("|"),
      prefetch.map((e) => e.iconKey).join("|"),
    ].join(";");
    if (signature === signatureRef.current) return;
    signatureRef.current = signature;

    const keepKeys = new Set<string>();
    for (const entry of [...visibleEntries, ...prefetch, ...(selectedEntry ? [selectedEntry] : [])]) {
      keepKeys.add(catalogIconCacheKey(handle.id, entry.iconKey));
    }
    cancelInvisibleIconBakes(keepKeys);

    const batches: IconBakeBatch[] = [];
    if (selectedEntry) {
      batches.push({ entries: [selectedEntry], priority: "selected" });
    }
    batches.push({ entries: visibleEntries, priority: "visible" });
    if (prefetch.length) {
      batches.push({ entries: prefetch, priority: "prefetch" });
    }

    scheduleCatalogIconBakes(
      batches,
      handle,
      mode,
      iconCacheLimit,
      textureCacheLimit,
    );
  }, [
    handle,
    queryRevision,
    visibleEntries,
    selectedEntry,
    prefetch,
    selectedId,
    mode,
    iconCacheLimit,
    textureCacheLimit,
  ]);
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
