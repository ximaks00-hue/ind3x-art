import { MousePointerClick, Paintbrush } from "lucide-react";

import { Icon } from "../../ui/icons/Icon";
import styles from "./EditorEmptyState.module.css";

export function EditorEmptyState() {
  return (
    <div className={styles.wrap}>
      <div className={styles.iconRow} aria-hidden>
        <span className={styles.iconBubble}>
          <Icon icon={MousePointerClick} size={20} />
        </span>
        <span className={styles.arrow}>→</span>
        <span className={styles.iconBubble}>
          <Icon icon={Paintbrush} size={20} />
        </span>
      </div>
      <h3 className={styles.title}>No face selected</h3>
      <p className={styles.subtitle}>
        Switch to <strong>Paint</strong> mode (Space), then click a face in the 3D viewer
        to edit its texture here.
      </p>
      <ul className={styles.steps}>
        <li>
          Press <kbd>Space</kbd> to toggle Orbit / Paint
        </li>
        <li>Click a block face in the viewer</li>
        <li>
          Use <kbd>B</kbd> pencil, <kbd>G</kbd> fill, <kbd>I</kbd> picker
        </li>
      </ul>
    </div>
  );
}
