import type { CatalogCategory, CatalogFacets } from "../../ipc/types";
import { CATALOG_CATEGORIES, CATALOG_CATEGORY_LABELS } from "./catalogUtils";
import styles from "./CatalogCategoryTabs.module.css";

interface CatalogCategoryTabsProps {
  facets: CatalogFacets | null;
  facetsError?: string | null;
  active: CatalogCategory | null;
  onSelect: (category: CatalogCategory | null) => void;
}

export function CatalogCategoryTabs({
  facets,
  facetsError,
  active,
  onSelect,
}: CatalogCategoryTabsProps) {
  const countFor = (key: CatalogCategory) =>
    facets?.byCategory.find((f) => f.key === key)?.count ?? 0;

  const total = facets?.byCategory.reduce((sum, f) => sum + f.count, 0) ?? 0;

  return (
    <div className={styles.bar} role="tablist" aria-label="Catalog categories">
      {facetsError ? (
        <span className={styles.facetsError} title={facetsError}>
          Tab counts unavailable
        </span>
      ) : null}
      <button
        type="button"
        role="tab"
        aria-selected={active === null}
        className={active === null ? styles.tabActive : styles.tab}
        onClick={() => onSelect(null)}
      >
        All
        {total > 0 ? (
          <span className={styles.count}>{total.toLocaleString()}</span>
        ) : null}
      </button>
      {CATALOG_CATEGORIES.map((category) => {
        const count = countFor(category);
        if (facets && count === 0) return null;
        return (
          <button
            key={category}
            type="button"
            role="tab"
            aria-selected={active === category}
            className={active === category ? styles.tabActive : styles.tab}
            onClick={() => onSelect(category)}
          >
            {CATALOG_CATEGORY_LABELS[category]}
            {count > 0 ? (
              <span className={styles.count}>{count.toLocaleString()}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
