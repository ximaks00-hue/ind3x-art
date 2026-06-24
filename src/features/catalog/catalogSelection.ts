import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useCatalogStore } from "./catalogStore";
import { catalogEntryToAssetEntry, findExplorerAssetForCatalog } from "./catalogUtils";

/** Studio selection — catalog store is the source of truth; classic explorer syncs on mode switch. */
export function applyCatalogSelection(entry: CatalogEntry): void {
  useCatalogStore.getState().selectEntry(entry);
  const settings = useSettingsStore.getState();
  settings.pushRecentCatalogId(entry.id);
  settings.setStudioSelectedCatalogId(entry.id);
  settings.setRightPanelCollapsed(false);
}

/** When leaving Studio, align classic explorer selection with the catalog row. */
export function syncClassicSelectionFromCatalog(): void {
  const entry = useCatalogStore.getState().selectedEntry;
  if (!entry) return;
  const indexed = findExplorerAssetForCatalog(entry, useProjectStore.getState().assets);
  if (indexed) {
    useProjectStore.getState().selectAsset(indexed);
    useSettingsStore.getState().pushRecentAsset(indexed.id);
    return;
  }
  const asset = catalogEntryToAssetEntry(entry);
  useProjectStore.getState().selectAsset(asset);
}
