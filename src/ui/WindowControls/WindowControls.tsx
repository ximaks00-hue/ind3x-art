import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";

import { Icon } from "../icons/Icon";
import styles from "./WindowControls.module.css";

export function WindowControls() {
  if (!isTauri()) {
    return null;
  }

  const win = getCurrentWindow();

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.btn}
        onClick={() => void win.minimize()}
        aria-label="Minimize window"
      >
        <Icon icon={Minus} size={16} />
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={() => void win.toggleMaximize()}
        aria-label="Maximize window"
      >
        <Icon icon={Square} size={16} />
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.close}`}
        onClick={() => void win.close()}
        aria-label="Close window"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  );
}
