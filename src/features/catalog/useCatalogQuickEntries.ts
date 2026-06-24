import { useEffect, useState } from "react";

import { getCatalogEntry } from "../../app/services/catalogService";
import type { CatalogEntry, ProjectHandle } from "../../ipc/types";

/** Resolve pinned/recent catalog ids via IPC (not limited to loaded grid page). */
export function useCatalogQuickEntries(
  handle: ProjectHandle | null,
  catalogIds: string[],
): Map<string, CatalogEntry> {
  const [entries, setEntries] = useState<Map<string, CatalogEntry>>(new Map());
  const idsKey = catalogIds.join("\0");

  useEffect(() => {
    if (!handle || catalogIds.length === 0) {
      setEntries(new Map());
      return;
    }

    let cancelled = false;
    void (async () => {
      const pairs = await Promise.all(
        catalogIds.map(async (id) => {
          try {
            const entry = await getCatalogEntry(handle, id);
            return [id, entry] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next = new Map<string, CatalogEntry>();
      for (const pair of pairs) {
        if (pair) next.set(pair[0], pair[1]);
      }
      setEntries(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [handle, idsKey, catalogIds]);

  return entries;
}
