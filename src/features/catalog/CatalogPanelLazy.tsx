import { lazy, Suspense } from "react";

import styles from "./CatalogPanel.module.css";

const CatalogPanel = lazy(() =>
  import("./CatalogPanel").then((module) => ({ default: module.CatalogPanel })),
);

function CatalogPanelFallback() {
  return (
    <div className={styles.panel}>
      <p className={styles.loading}>Loading catalog…</p>
    </div>
  );
}

export function CatalogPanelLazy() {
  return (
    <Suspense fallback={<CatalogPanelFallback />}>
      <CatalogPanel />
    </Suspense>
  );
}
