import { useCatalogFilterRecovery } from "./useCatalogAutoSelect";
import { useCatalogQuery } from "./useCatalogQuery";

/** Run catalog fetch + auto-select at app level (not tied to lazy CatalogPanel mount). */
export function useCatalogBootstrap() {
  useCatalogQuery();
  useCatalogFilterRecovery();
}
