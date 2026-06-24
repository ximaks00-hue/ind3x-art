import styles from "./primitives.module.css";

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div className={styles.spinner} role="status" aria-label={label} />;
}
