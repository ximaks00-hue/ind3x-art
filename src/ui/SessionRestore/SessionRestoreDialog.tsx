import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button } from "../primitives";
import styles from "./SessionRestoreDialog.module.css";

interface SessionRestoreDialogProps {
  open: boolean;
  path: string;
  onConfirm: () => void;
  onDecline: () => void;
}

function formatPath(path: string) {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

export function SessionRestoreDialog({
  open,
  path,
  onConfirm,
  onDecline,
}: SessionRestoreDialogProps) {
  const trapRef = useFocusTrap(open);
  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal aria-label="Restore session">
      <div className={styles.dialog} ref={trapRef}>
        <h2 className={styles.title}>Restore last project?</h2>
        <p className={styles.body}>
          Reopen <strong className={styles.path}>{formatPath(path)}</strong> from your
          last session?
        </p>
        <p className={styles.mono} title={path}>
          {path}
        </p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onDecline}>
            Not now
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Open project
          </Button>
        </div>
      </div>
    </div>
  );
}
