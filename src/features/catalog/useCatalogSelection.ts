import { useCallback } from "react";

import type { CatalogEntry } from "../../ipc/types";
import { applyCatalogSelection } from "./catalogSelection";

export function useCatalogSelection() {
  const selectEntry = useCallback((entry: CatalogEntry) => {
    applyCatalogSelection(entry);
  }, []);

  return { selectEntry };
}
