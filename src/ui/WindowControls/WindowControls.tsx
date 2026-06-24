import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";

import { Icon } from "../icons/Icon";
import styles from "./WindowControls.module.css";

function stopWindowDrag(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  const syncMaximized = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const maximized = await getCurrentWindow().isMaximized();
      setIsMaximized(maximized);
    } catch {
      // ignore outside Tauri host
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;

    const win = getCurrentWindow();
    void syncMaximized();

    let unlisten: (() => void) | undefined;
    void win.onResized(() => {
      void syncMaximized();
    }).then((dispose) => {
      unlisten = dispose;
    });

    return () => {
      unlisten?.();
    };
  }, [syncMaximized]);

  if (!isTauri()) {
    return null;
  }

  const win = getCurrentWindow();

  return (
    <div className={styles.controls}>
      <button
        type="button"
        className={styles.btn}
        onMouseDown={stopWindowDrag}
        onClick={() => void win.minimize()}
        aria-label="Minimize window"
      >
        <Icon icon={Minus} size={16} />
      </button>
      <button
        type="button"
        className={styles.btn}
        onMouseDown={stopWindowDrag}
        onClick={() => void win.toggleMaximize()}
        aria-label={isMaximized ? "Restore window" : "Maximize window"}
      >
        <Icon icon={isMaximized ? Copy : Square} size={16} />
      </button>
      <button
        type="button"
        className={`${styles.btn} ${styles.close}`}
        onMouseDown={stopWindowDrag}
        onClick={() => void win.close()}
        aria-label="Close window"
      >
        <Icon icon={X} size={16} />
      </button>
    </div>
  );
}
