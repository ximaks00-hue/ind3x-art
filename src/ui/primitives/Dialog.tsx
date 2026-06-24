import type { ReactNode } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./primitives.module.css";

interface DialogProps {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}

export function Dialog({ open, title, children, footer, onClose }: DialogProps) {
  const trapRef = useFocusTrap(open);

  if (!open) return null;

  return (
    <div
      className={styles.dialogBackdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={trapRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <div id="dialog-title" className={styles.dialogHeader}>
          {title}
        </div>
        <div className={styles.dialogBody}>{children}</div>
        {footer ? <div className={styles.dialogFooter}>{footer}</div> : null}
      </div>
    </div>
  );
}
