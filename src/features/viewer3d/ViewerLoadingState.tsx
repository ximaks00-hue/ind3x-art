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
      <div className={styles.voxelCube} aria-hidden>
        <span className={styles.face} data-face="top" />
        <span className={styles.face} data-face="front" />
        <span className={styles.face} data-face="side" />
      </div>
      <Spinner label={label} />
    </div>
  );
}
