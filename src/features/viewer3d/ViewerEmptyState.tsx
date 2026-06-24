import { Archive, FolderOpen } from "lucide-react";

import { Button } from "../../ui/primitives/Button";
import { Icon } from "../../ui/icons/Icon";
import styles from "./ViewerEmptyState.module.css";

interface ViewerEmptyStateProps {
  onOpenJar: () => void;
  onOpenFolder: () => void;
  studioMode?: boolean;
  catalogTotal?: number;
  onOpenClassic?: () => void;
  onRetryCatalog?: () => void;
}

export function ViewerEmptyState({
  onOpenJar,
  onOpenFolder,
  studioMode = false,
  catalogTotal = 0,
  onOpenClassic,
  onRetryCatalog,
}: ViewerEmptyStateProps) {
  const studioCatalogEmpty = studioMode && catalogTotal === 0;

  return (
    <div className={styles.wrap}>
      <div className={styles.illustration} aria-hidden>
        <div className={styles.cube}>
          <span className={styles.face} data-face="top" />
          <span className={styles.face} data-face="front" />
          <span className={styles.face} data-face="side" />
        </div>
      </div>
      <h2 className={styles.title}>
        {studioMode ? "Studio preview" : "3D Preview"}
      </h2>
      <p className={styles.subtitle}>
        {studioCatalogEmpty
          ? "This pack opened but the catalog is empty — common for older cached indexes on texture-only mod JARs. Rebuild the catalog or switch to Classic mode to browse raw assets."
          : studioMode
            ? "Pick a block or item from the catalog on the left to preview and paint it in 3D."
            : "Select an asset in the explorer, or open a mod JAR / resource folder to preview in-game models."}
      </p>
      <div className={styles.actions}>
        {studioCatalogEmpty && onRetryCatalog ? (
          <Button variant="primary" onClick={onRetryCatalog}>
            Rebuild catalog
          </Button>
        ) : null}
        {studioMode && onOpenClassic ? (
          <Button variant={studioCatalogEmpty ? "default" : "primary"} onClick={onOpenClassic}>
            Open Classic mode
          </Button>
        ) : null}
        {!studioMode ? (
          <>
            <Button variant="primary" onClick={onOpenJar}>
              <Icon icon={Archive} size={16} />
              Open JAR
            </Button>
            <Button onClick={onOpenFolder}>
              <Icon icon={FolderOpen} size={16} />
              Open folder
            </Button>
          </>
        ) : null}
      </div>
      <p className={styles.hint}>
        Double-click a face to zoom · C cycles compare · 1–5 camera presets
      </p>
    </div>
  );
}
