import styles from "./CatalogGridSkeleton.module.css";

const SKELETON_ROWS = 8;
const SKELETON_COLS = 9;

interface CatalogGridSkeletonProps {
  showLabels?: boolean;
}

export function CatalogGridSkeleton({ showLabels = false }: CatalogGridSkeletonProps) {
  const count = SKELETON_ROWS * SKELETON_COLS;
  return (
    <div className={styles.skeleton} aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={`${styles.cell} ${showLabels ? styles.cellLabeled : styles.cellCompact}`}
        />
      ))}
    </div>
  );
}
