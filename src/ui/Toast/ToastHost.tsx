import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

import { useUiStore } from "../../state/uiStore";
import { Icon } from "../icons/Icon";
import styles from "./ToastHost.module.css";

const VARIANT_ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

function ToastList({
  toasts,
  onDismiss,
}: {
  toasts: ReturnType<typeof useUiStore.getState>["toasts"];
  onDismiss: (id: string) => void;
}) {
  return (
    <>
      {toasts.map((toast) => {
        const VariantIcon = VARIANT_ICONS[toast.variant];
        return (
          <div
            key={toast.id}
            className={`${styles.toast} ${styles[toast.variant]}`}
            role={toast.variant === "error" ? "alert" : "status"}
          >
            <span className={styles.iconWrap} aria-hidden>
              <Icon icon={VariantIcon} size={20} />
            </span>
            <span className={styles.message}>{toast.message}</span>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
            >
              <Icon icon={X} size={16} />
            </button>
          </div>
        );
      })}
    </>
  );
}

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  const errorToasts = toasts.filter((toast) => toast.variant === "error");
  const politeToasts = toasts.filter((toast) => toast.variant !== "error");

  return (
    <div className={styles.wrapper}>
      {errorToasts.length > 0 && (
        <div className={styles.host} aria-live="assertive" aria-relevant="additions">
          <ToastList toasts={errorToasts} onDismiss={dismissToast} />
        </div>
      )}
      {politeToasts.length > 0 && (
        <div className={styles.host} aria-live="polite" aria-relevant="additions">
          <ToastList toasts={politeToasts} onDismiss={dismissToast} />
        </div>
      )}
    </div>
  );
}
