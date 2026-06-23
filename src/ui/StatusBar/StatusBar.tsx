import styles from "./StatusBar.module.css";

interface StatusBarProps {
  version?: string;
  ipcHealthy: boolean;
  indexStatus: string;
  indexProgress: number;
  indexStage: string;
  interactionMode?: string;
  cameraPreset?: string;
  fps?: number;
  saveMessage?: string;
  /** Currently open texture namespace */
  namespace?: string;
  /** Editor zoom factor */
  zoom?: number;
  /** Cursor position in texture space */
  cursorX?: number | null;
  cursorY?: number | null;
}

export function StatusBar({
  version,
  ipcHealthy,
  indexStatus,
  indexProgress,
  indexStage,
  interactionMode,
  cameraPreset,
  fps,
  saveMessage,
  namespace,
  zoom,
  cursorX,
  cursorY,
}: StatusBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.group}>
        <span className={styles.label}>Core</span>
        <span className={ipcHealthy ? styles.dotOk : styles.dotWarn} aria-hidden />
        <span>{ipcHealthy ? "Connected" : "Checking…"}</span>
      </div>

      <div className={styles.group}>
        <span className={styles.label}>Index</span>
        <span className={styles.muted}>{indexStatus}</span>
        {indexStatus === "running" && (
          <>
            <span className={styles.sep}>·</span>
            <span>{indexProgress}%</span>
            <span className={styles.muted}>{indexStage}</span>
          </>
        )}
      </div>

      {namespace ? (
        <div className={styles.group}>
          <span className={styles.label}>NS</span>
          <span className={styles.mono}>{namespace}</span>
        </div>
      ) : null}

      {zoom !== undefined ? (
        <div className={styles.group}>
          <span className={styles.label}>Zoom</span>
          <span className={styles.mono}>{zoom}×</span>
        </div>
      ) : null}

      {cursorX !== null &&
      cursorX !== undefined &&
      cursorY !== null &&
      cursorY !== undefined ? (
        <div className={styles.group}>
          <span className={styles.mono}>
            {cursorX},{cursorY}
          </span>
        </div>
      ) : null}

      <div className={styles.group}>
        <span className={styles.label}>Viewer</span>
        <span className={styles.muted}>{interactionMode ?? "orbit"}</span>
        {cameraPreset ? (
          <>
            <span className={styles.sep}>·</span>
            <span className={styles.muted}>{cameraPreset}</span>
          </>
        ) : null}
        {fps !== undefined && fps > 0 ? (
          <>
            <span className={styles.sep}>·</span>
            <span>{fps} FPS</span>
          </>
        ) : null}
      </div>

      {saveMessage ? (
        <div className={styles.group}>
          <span className={styles.label}>Save</span>
          <span className={styles.muted}>{saveMessage}</span>
        </div>
      ) : null}

      <div className={styles.spacer} />

      <div className={styles.group}>
        <span className={styles.muted}>v{version ?? "—"}</span>
      </div>
    </div>
  );
}
