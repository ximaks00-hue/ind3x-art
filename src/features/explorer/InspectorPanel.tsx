import type { AssetDetails, RelationshipNode } from "../../ipc/types";
import styles from "./InspectorPanel.module.css";

interface InspectorPanelProps {
  details: AssetDetails | null;
  loading: boolean;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onSelectRelated: (assetId: string) => void;
}

function RelationshipTree({
  nodes,
  onSelect,
}: {
  nodes: RelationshipNode[];
  onSelect: (path: string) => void;
}) {
  if (!nodes.length) return null;
  return (
    <ul className={styles.tree}>
      {nodes.map((node) => (
        <li key={node.id}>
          <button
            type="button"
            className={styles.treeNode}
            onClick={() => onSelect(node.path)}
          >
            <span className={styles.treeKind}>{node.kind}</span>
            {node.label}
          </button>
          {node.children.length > 0 && (
            <RelationshipTree nodes={node.children} onSelect={onSelect} />
          )}
        </li>
      ))}
    </ul>
  );
}

export function InspectorPanel({
  details,
  loading,
  isFavorite,
  onToggleFavorite,
  onSelectRelated,
}: InspectorPanelProps) {
  if (loading) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>Loading inspector…</p>
      </div>
    );
  }

  if (!details) {
    return (
      <div className={styles.panel}>
        <p className={styles.muted}>Select an asset to inspect.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3 className={styles.title}>{details.displayName}</h3>
        <button
          type="button"
          className={isFavorite ? styles.pinActive : styles.pin}
          onClick={onToggleFavorite}
          title={isFavorite ? "Unpin" : "Pin favorite"}
        >
          {isFavorite ? "★" : "☆"}
        </button>
      </div>
      <dl className={styles.meta}>
        <dt>Kind</dt>
        <dd>{details.kind}</dd>
        <dt>Namespace</dt>
        <dd>{details.namespace}</dd>
        <dt>Path</dt>
        <dd className={styles.path}>{details.path}</dd>
        {details.packFormat != null && (
          <>
            <dt>Pack format</dt>
            <dd>{details.packFormat}</dd>
          </>
        )}
        {details.textureWidth != null && details.textureHeight != null && (
          <>
            <dt>PNG size</dt>
            <dd>
              {details.textureWidth}×{details.textureHeight}
            </dd>
          </>
        )}
        {details.linkedModels.length > 0 && (
          <>
            <dt>Linked models</dt>
            <dd>{details.linkedModels.length}</dd>
          </>
        )}
      </dl>
      {details.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {details.warnings.map((w) => (
            <li key={`${w.code}-${w.message}`} title={w.message}>
              ⚠ {w.message}
            </li>
          ))}
        </ul>
      )}
      {details.relationships.length > 0 && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Relationships</h4>
          <RelationshipTree
            nodes={details.relationships}
            onSelect={(path) => onSelectRelated(path)}
          />
        </div>
      )}
    </div>
  );
}
