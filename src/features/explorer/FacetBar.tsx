import type { AssetFacets, AssetKind } from "../../ipc/types";
import { ASSET_KIND_LABELS } from "../../ipc/types";
import styles from "./FacetBar.module.css";

interface FacetBarProps {
  facets: AssetFacets | null;
  kindFilter: AssetKind | "all";
  namespaceFilter: string;
  onKindSelect: (kind: AssetKind | "all") => void;
  onNamespaceSelect: (namespace: string) => void;
}

export function FacetBar({
  facets,
  kindFilter,
  namespaceFilter,
  onKindSelect,
  onNamespaceSelect,
}: FacetBarProps) {
  if (!facets) return null;

  const topKinds = facets.byKind.slice(0, 6);
  const topNamespaces = facets.byNamespace.slice(0, 4);

  return (
    <div className={styles.bar}>
      <div className={styles.row}>
        {topKinds.map((facet) => (
          <button
            key={facet.key}
            type="button"
            className={kindFilter === facet.key ? styles.chipActive : styles.chip}
            onClick={() =>
              onKindSelect(
                kindFilter === (facet.key as AssetKind)
                  ? "all"
                  : (facet.key as AssetKind),
              )
            }
          >
            {ASSET_KIND_LABELS[facet.key as AssetKind] ?? facet.key}
            <span className={styles.count}>{facet.count.toLocaleString()}</span>
          </button>
        ))}
      </div>
      {topNamespaces.length > 1 && (
        <div className={styles.row}>
          {topNamespaces.map((facet) => (
            <button
              key={facet.key}
              type="button"
              className={
                namespaceFilter === facet.key ? styles.chipNsActive : styles.chipNs
              }
              onClick={() =>
                onNamespaceSelect(namespaceFilter === facet.key ? "" : facet.key)
              }
            >
              {facet.key}
              <span className={styles.count}>{facet.count.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
