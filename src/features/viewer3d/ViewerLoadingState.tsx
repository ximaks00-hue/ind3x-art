import { Spinner } from "../../ui/primitives/Spinner";
import styles from "./ViewerLoadingState.module.css";

interface ViewerLoadingStateProps {
  label?: string;
}

export function ViewerLoadingState({
  label = "Resolving model…",
}: ViewerLoadingStateProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.skeletonMesh} aria-hidden>
        <div className={styles.block} />
        <div className={styles.block} data-offset />
        <div className={styles.block} data-small />
      </div>
      <Spinner label={label} />
      <p className={styles.label}>{label}</p>
    </div>
  );
}
