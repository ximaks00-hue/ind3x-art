import { useCallback } from "react";

import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useCatalogStore } from "./catalogStore";
import { catalogEntryToAssetEntry } from "./catalogUtils";

export function useCatalogSelection() {
  const selectAsset = useProjectStore((s) => s.selectAsset);
  const pushRecentAsset = useSettingsStore((s) => s.pushRecentAsset);
  const setStudioSelectedCatalogId = useSettingsStore(
    (s) => s.setStudioSelectedCatalogId,
  );
  const selectCatalogEntry = useCatalogStore((s) => s.selectEntry);

  const selectEntry = useCallback(
    (entry: CatalogEntry) => {
      selectCatalogEntry(entry);
      const asset = catalogEntryToAssetEntry(entry);
      selectAsset(asset);
      pushRecentAsset(asset.id);
      setStudioSelectedCatalogId(entry.id);
    },
    [selectCatalogEntry, selectAsset, pushRecentAsset, setStudioSelectedCatalogId],
  );

  return { selectEntry };
}
