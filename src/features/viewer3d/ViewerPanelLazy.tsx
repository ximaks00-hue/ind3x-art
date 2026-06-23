import { lazy, Suspense } from "react";

import styles from "./ViewerPanel.module.css";

const ViewerPanel = lazy(() =>
  import("./ViewerPanel").then((module) => ({ default: module.ViewerPanel })),
);

function ViewerPanelFallback() {
  return (
    <div className={styles.panel}>
      <div className={styles.message}>
        <p>3D Viewer</p>
        <p className={styles.hint}>Loading renderer…</p>
      </div>
    </div>
  );
}

export function ViewerPanelLazy() {
  return (
    <Suspense fallback={<ViewerPanelFallback />}>
      <ViewerPanel />
    </Suspense>
  );
}
