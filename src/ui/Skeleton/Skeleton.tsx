import styles from "./Skeleton.module.css";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = 14,
  borderRadius = 4,
  className,
}: SkeletonProps) {
  return (
    <span
      className={`${styles.skeleton}${className ? ` ${className}` : ""}`}
      style={{ width, height, borderRadius }}
      aria-hidden
    />
  );
}

export function SkeletonBlock({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.block} aria-busy="true" aria-label="Loading…">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} width={`${60 + ((i * 23) % 40)}%`} />
      ))}
    </div>
  );
}
