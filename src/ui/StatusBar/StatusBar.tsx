import { AlertTriangle, Check } from "lucide-react";

import { useUiStore } from "../../state/uiStore";
import { Icon } from "../icons/Icon";
import { StatusBarFps } from "./StatusBarFps";
import styles from "./StatusBar.module.css";

interface StatusBarProps {
  ipcHealthy: boolean;
  assetCount?: number;
  catalogTotal?: number;
  catalogLoading?: boolean;
  catalogQueryError?: string | null;
  indexStatus: string;
  workspaceLabel?: string;
  catalogEntryLabel?: string;
  faceDirection?: string;
  textureLabel?: string;
  textureDirty?: boolean;
  studioCompact?: boolean;
  toolLabel?: string;
  layerIndex?: number;
  layerTotal?: number;
  dirtyCount?: number;
  zoom?: number;
  cursorX?: number | null;
  cursorY?: number | null;
  interactionMode?: string;
  cameraPreset?: string;
}

function DirtyIndicator({ label }: { label: string }) {
  return (
    <span className={styles.dirty}>
      <span className="status-dot status-dot--pulse" aria-hidden />
      {label}
    </span>
  );
}

export function StatusBar({
  ipcHealthy,
  assetCount,
  catalogTotal,
  catalogLoading,
  catalogQueryError,
  indexStatus,
  workspaceLabel,
  catalogEntryLabel,
  faceDirection,
  textureLabel,
  textureDirty = false,
  studioCompact = false,
  toolLabel,
  layerIndex,
  layerTotal,
  dirtyCount = 0,
  zoom,
  cursorX,
  cursorY,
  interactionMode,
  cameraPreset,
}: StatusBarProps) {
  const saveFlashTick = useUiStore((s) => s.saveFlashTick);

  const indexRunning = indexStatus === "running";
  const indexDone = indexStatus === "done" && assetCount != null;
  const indexLabel = indexDone
    ? `${assetCount.toLocaleString()} assets`
    : indexRunning
      ? "indexing…"
      : indexStatus;

  const catalogLabel =
    catalogQueryError != null
      ? "catalog error"
      : catalogLoading
        ? "catalog…"
        : catalogTotal != null
          ? `${catalogTotal.toLocaleString()} catalog`
          : undefined;

  if (studioCompact && catalogEntryLabel) {
    const creativeParts = [catalogEntryLabel];
    if (faceDirection) creativeParts.push(`${faceDirection} face`);
    if (textureLabel) creativeParts.push(textureLabel);
    if (textureDirty) creativeParts.push("dirty");

    return (
      <div
        key={saveFlashTick}
        className={`${styles.bar} ${styles.studioBar}${saveFlashTick > 0 ? ` ${styles.saveFlash}` : ""}`}
        aria-label="Application status"
      >
        <span className={styles.studioLine}>
          {creativeParts.map((part, i) => (
            <span key={part}>
              {i > 0 ? <span className={styles.dotSep}> · </span> : null}
              {part === "dirty" ? <DirtyIndicator label="dirty" /> : part}
            </span>
          ))}
        </span>
      </div>
    );
  }

  const segments: string[] = [];
  if (workspaceLabel) segments.push(workspaceLabel);
  if (catalogLabel) segments.push(catalogLabel);
  if (catalogEntryLabel) segments.push(catalogEntryLabel);
  if (faceDirection) segments.push(`Face: ${faceDirection}`);
  if (textureLabel) segments.push(textureLabel);

  if (toolLabel) segments.push(`Tool: ${toolLabel}`);
  if (layerIndex != null && layerTotal != null) {
    segments.push(`Layer ${layerIndex}/${layerTotal}`);
  }
  if (dirtyCount > 0) segments.push(`Dirty: ${dirtyCount}`);
  if (zoom !== undefined) segments.push(`Zoom ${zoom}×`);
  if (
    cursorX !== null &&
    cursorX !== undefined &&
    cursorY !== null &&
    cursorY !== undefined
  ) {
    segments.push(`(${cursorX}, ${cursorY})`);
  }
  if (interactionMode) {
    segments.push(interactionMode.charAt(0).toUpperCase() + interactionMode.slice(1));
  }
  if (cameraPreset) segments.push(cameraPreset);

  return (
    <div
      key={saveFlashTick}
      className={`${styles.bar}${saveFlashTick > 0 ? ` ${styles.saveFlash}` : ""}`}
      aria-label="Application status"
    >
      <span className={styles.segment}>
        <span className={styles.ipcStatus} data-healthy={ipcHealthy}>
          <span
            className={`status-dot${ipcHealthy ? "" : " status-dot--pulse"}`}
            aria-hidden
          />
          IPC {ipcHealthy ? "ok" : "offline"}
        </span>
      </span>
      <span className={styles.segment}>
        <span className={styles.sep} aria-hidden>
          |
        </span>
        <span className={indexRunning ? styles.indexing : undefined}>
          {indexRunning ? (
            <span className="status-dot status-dot--breathe" aria-hidden />
          ) : indexDone ? (
            <Icon icon={Check} size={16} className={styles.statusIcon} aria-hidden />
          ) : null}
          Index {indexLabel}
        </span>
      </span>
      {segments.map((segment) => (
        <span key={segment} className={styles.segment}>
          <span className={styles.sep} aria-hidden>
            |
          </span>
          <span
            className={
              segment.startsWith("Dirty:")
                ? styles.dirty
                : segment === workspaceLabel
                  ? styles.modeBadge
                  : segment === "catalog error"
                    ? styles.catalogError
                    : segment.startsWith("Zoom ") || segment.startsWith("(")
                      ? styles.metric
                      : undefined
            }
          >
            {segment.startsWith("Dirty:") ? (
              <DirtyIndicator label={segment} />
            ) : segment === "catalog error" ? (
              <>
                <Icon icon={AlertTriangle} size={16} className={styles.statusIcon} aria-hidden />
                {segment}
              </>
            ) : (
              segment
            )}
          </span>
        </span>
      ))}
      <StatusBarFps />
    </div>
  );
}
