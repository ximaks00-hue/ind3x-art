import { useCallback, useState } from "react";

import { bumpProjectDataRevision } from "../../app/projectDataRevision";
import {
  getCatalogEntry,
  rebuildProjectCatalog,
} from "../../app/services/catalogService";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useUiStore } from "../../state/uiStore";
import { useCatalogStore } from "./catalogStore";

/** Rebuild catalog index for a new display language (shared by Settings and Catalog panel). */
export function useCatalogLanguageSwitch() {
  const handle = useProjectStore((s) => s.handle);
  const catalogLanguage = useSettingsStore((s) => s.catalogLanguage);
  const setCatalogLanguage = useSettingsStore((s) => s.setCatalogLanguage);
  const pushToast = useUiStore((s) => s.pushToast);
  const [busy, setBusy] = useState(false);

  const switchLanguage = useCallback(
    async (next: string) => {
      const previous = catalogLanguage;
      if (next === previous) return;
      setCatalogLanguage(next);
      if (!handle) return;
      setBusy(true);
      try {
        await rebuildProjectCatalog(handle, next);
        bumpProjectDataRevision();
        const selectedId = useCatalogStore.getState().selectedId;
        if (selectedId) {
          try {
            const entry = await getCatalogEntry(handle, selectedId);
            useCatalogStore.getState().selectEntry(entry);
          } catch {
            // selection may no longer exist after rebuild
          }
        }
      } catch (e) {
        setCatalogLanguage(previous);
        pushToast(
          e instanceof Error ? e.message : "Failed to rebuild catalog for language",
          "error",
        );
      } finally {
        setBusy(false);
      }
    },
    [catalogLanguage, handle, pushToast, setCatalogLanguage],
  );

  return { catalogLanguage, switchLanguage, busy };
}
