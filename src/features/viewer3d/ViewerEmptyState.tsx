import { Archive, FolderOpen } from "lucide-react";

import { Button } from "../../ui/primitives/Button";
import { Icon } from "../../ui/icons/Icon";
import styles from "./ViewerEmptyState.module.css";

interface ViewerEmptyStateProps {
  onOpenJar: () => void;
  onOpenFolder: () => void;
}

export function ViewerEmptyState({ onOpenJar, onOpenFolder }: ViewerEmptyStateProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.illustration} aria-hidden>
        <div className={styles.cube}>
          <span className={styles.face} data-face="top" />
          <span className={styles.face} data-face="front" />
          <span className={styles.face} data-face="side" />
        </div>
      </div>
      <h2 className={styles.title}>3D Preview</h2>
      <p className={styles.subtitle}>
        Select an asset in the explorer, or open a mod JAR / resource folder to preview
        in-game models.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" onClick={onOpenJar}>
          <Icon icon={Archive} size={16} />
          Open JAR
        </Button>
        <Button onClick={onOpenFolder}>
          <Icon icon={FolderOpen} size={16} />
          Open folder
        </Button>
      </div>
      <p className={styles.hint}>
        Double-click a face to zoom · C cycles compare · 1–5 camera presets
      </p>
    </div>
  );
}
