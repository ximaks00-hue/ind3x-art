import { refreshCatalogCaches } from "../../app/projectDataRevision";
import { useCatalogStore } from "./catalogStore";
import { useSettingsStore } from "../../state/settingsStore";

/** Studio workspace enter: catalog selection + panel layout (orchestrated outside settings store). */
export function studioEnterPatch(): {
  leftPanelCollapsed: false;
  focusMode: false;
} {
  const catalog = useCatalogStore.getState();
  const settings = useSettingsStore.getState();
  catalog.setSessionRestorePending(false);
  if (!catalog.selectedId && catalog.entries.length > 0) {
    const entry = catalog.entries[0]!;
    catalog.selectEntry(entry);
    settings.pushRecentCatalogId(entry.id);
    settings.setStudioSelectedCatalogId(entry.id);
    settings.setRightPanelCollapsed(false);
  } else if (catalog.entries.length === 0 && !catalog.loading) {
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
