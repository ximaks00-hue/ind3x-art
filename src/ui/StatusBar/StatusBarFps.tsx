import { useSyncExternalStore } from "react";

import { useProjectStore } from "../../state/projectStore";
import { getViewerFps, subscribeViewerFps } from "../../state/viewerFps";
import styles from "./StatusBar.module.css";

/** FPS display isolated from App re-renders — updates ~2×/sec without touching parent tree. */
export function StatusBarFps() {
  const handle = useProjectStore((s) => s.handle);
  const fps = useSyncExternalStore(subscribeViewerFps, getViewerFps, () => 0);

  if (!handle || fps <= 0) return null;

  return (
    <>
      <span className={styles.sep} aria-hidden>
        |
      </span>
      <span className={styles.segment}>{fps} FPS</span>
    </>
  );
}
