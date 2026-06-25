import { refreshCatalogCaches } from "../../app/projectDataRevision";
import { useCatalogStore } from "./catalogStore";

/** Studio workspace enter: layout only — browsing starts with no forced selection. */
export function studioEnterPatch(): {
  leftPanelCollapsed: false;
  focusMode: false;
} {
  const catalog = useCatalogStore.getState();
  if (catalog.entries.length === 0 && !catalog.loading) {
    refreshCatalogCaches();
  }
  return {
    leftPanelCollapsed: false,
    focusMode: false,
  };
}

/** Classic workspace enter: sync explorer selection from catalog when applicable. */
export function classicEnterFromStudio(): void {
  void import("./catalogSelection").then((m) => m.syncClassicSelectionFromCatalog());
}
