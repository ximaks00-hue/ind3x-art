import { lazy, Suspense } from "react";

import { ViewerLoadingState } from "./ViewerLoadingState";
import styles from "./ViewerPanel.module.css";

const ViewerPanel = lazy(() =>
  import("./ViewerPanel").then((module) => ({ default: module.ViewerPanel })),
);

interface ViewerPanelLazyProps {
  onOpenJar?: () => void;
  onOpenFolder?: () => void;
  onOpenRecent?: (path: string, kind: "jar" | "folder") => void;
  onTryDemo?: () => void;
}

function ViewerPanelFallback() {
  return (
    <div className={styles.panel}>
      <ViewerLoadingState label="Loading renderer…" />
    </div>
  );
}

export function ViewerPanelLazy({
  onOpenJar,
  onOpenFolder,
  onOpenRecent,
  onTryDemo,
}: ViewerPanelLazyProps) {
  return (
    <div className={styles.panelHost}>
      <Suspense fallback={<ViewerPanelFallback />}>
        <ViewerPanel
          onOpenJar={onOpenJar}
          onOpenFolder={onOpenFolder}
          onOpenRecent={onOpenRecent}
          onTryDemo={onTryDemo}
        />
      </Suspense>
    </div>
  );
}
