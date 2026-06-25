import { useEffect, useState } from "react";

import { getCatalogEntriesBatch } from "../../app/services/catalogService";
import type { CatalogEntry, ProjectHandle } from "../../ipc/types";
import { useCatalogStore } from "./catalogStore";

/** Resolve pinned/recent catalog ids via IPC (not limited to loaded grid page). */
export function useCatalogQuickEntries(
  handle: ProjectHandle | null,
  catalogIds: string[],
): Map<string, CatalogEntry> {
  const [entries, setEntries] = useState<Map<string, CatalogEntry>>(new Map());
  const queryRevision = useCatalogStore((s) => s.queryRevision);
  const gridEntries = useCatalogStore((s) => s.entries);
  const idsKey = catalogIds.join("\0");

  useEffect(() => {
    if (!handle || catalogIds.length === 0) {
      setEntries(new Map());
      return;
    }

    const gridById = new Map(
      gridEntries
        .filter((entry) => catalogIds.includes(entry.id))
        .map((entry) => [entry.id, entry] as const),
    );
    const missingIds = catalogIds.filter((id) => !gridById.has(id));

    if (missingIds.length === 0) {
      const prev = entries;
      if (
        prev.size === gridById.size &&
        [...gridById.keys()].every((id) => prev.get(id) === gridById.get(id))
      ) {
        return;
      }
      setEntries(gridById);
      return;
    }

    const controller = new AbortController();
    void (async () => {
      try {
        const batch = await getCatalogEntriesBatch(handle, missingIds, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const next = new Map(gridById);
        for (const entry of batch) {
          next.set(entry.id, entry);
        }
        setEntries(next);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.warn("[catalog] quick entries batch failed", error);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [handle, idsKey, catalogIds, gridEntries, queryRevision]);

  return entries;
}
