import { Spinner } from "../primitives/Spinner";
import styles from "./ProjectOpenOverlay.module.css";

interface ProjectOpenOverlayProps {
  stage: string;
  progress: number;
}

export function ProjectOpenOverlay({ stage, progress }: ProjectOpenOverlayProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const label = stage
    ? `${stage}… ${clamped}%`
    : `Opening… ${clamped}%`;

  return (
    <div className={styles.overlay} role="status" aria-live="polite" aria-busy="true">
      <div className={styles.card}>
        <Spinner label={label} />
        <p className={styles.title}>Opening pack</p>
        <p className={styles.label}>{label}</p>
        <div className={styles.bar} aria-hidden>
          <div className={styles.barFill} style={{ width: `${clamped}%` }} />
        </div>
        <p className={styles.hint}>Large mod JARs may take a moment on first open.</p>
      </div>
    </div>
  );
}
