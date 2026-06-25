import { useMemo } from "react";

import { useRovingTabindex } from "../../hooks/useRovingTabindex";
import type { CatalogCategory, CatalogFacets } from "../../ipc/types";
import { CATALOG_CATEGORIES, CATALOG_CATEGORY_LABELS } from "./catalogUtils";
import styles from "./CatalogCategoryTabs.module.css";

interface CatalogCategoryTabsProps {
  facets: CatalogFacets | null;
  facetsError?: string | null;
  active: CatalogCategory | null;
  onSelect: (category: CatalogCategory | null) => void;
  gridId?: string;
}

type TabKey = CatalogCategory | null;

interface TabItem {
  key: TabKey;
  label: string;
  count: number;
}

export function CatalogCategoryTabs({
  facets,
  facetsError,
  active,
  onSelect,
  gridId,
}: CatalogCategoryTabsProps) {
  const countFor = (key: CatalogCategory) =>
    facets?.byCategory.find((f) => f.key === key)?.count ?? 0;

  const total = facets?.byCategory.reduce((sum, f) => sum + f.count, 0) ?? 0;

  const tabs = useMemo(() => {
    const items: TabItem[] = [{ key: null, label: "All", count: total }];
    for (const category of CATALOG_CATEGORIES) {
      const count = countFor(category);
      if (facets && count === 0) continue;
      items.push({
        key: category,
        label: CATALOG_CATEGORY_LABELS[category],
        count,
      });
    }
    return items;
  }, [facets, total]);

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.key === active),
  );

  const { setItemRef, onKeyDown, getTabIndex } = useRovingTabindex(tabs.length, activeIndex, {
    activateOnFocus: true,
    onActivate: (index) => {
      const tab = tabs[index];
      if (tab) onSelect(tab.key);
    },
  });

  return (
    <div
      className={styles.bar}
      role="tablist"
      aria-label="Catalog categories"
      onKeyDown={onKeyDown}
    >
      {facetsError ? (
        <span className={styles.facetsError} title={facetsError}>
          Tab counts unavailable
        </span>
      ) : null}
      {tabs.map((tab, index) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key ?? "all"}
            ref={setItemRef(index)}
            type="button"
            role="tab"
            id={tab.key ? `catalog-tab-${tab.key}` : "catalog-tab-all"}
            aria-selected={isActive}
            aria-controls={gridId}
            tabIndex={getTabIndex(index)}
            className={isActive ? styles.tabActive : styles.tab}
            onClick={() => onSelect(tab.key)}
          >
            {tab.label}
            {tab.count > 0 ? (
              <span className={styles.count}>{tab.count.toLocaleString()}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
