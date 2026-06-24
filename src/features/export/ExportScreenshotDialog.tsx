import { useState } from "react";

import type {
  ScreenshotExportOptions,
  ScreenshotFormat,
} from "../../lib/exportScreenshot";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { Button } from "../../ui/primitives/Button";
import styles from "./ExportScreenshotDialog.module.css";

interface ExportScreenshotDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (options: ScreenshotExportOptions) => void;
}

export function ExportScreenshotDialog({
  open,
  onClose,
  onExport,
}: ExportScreenshotDialogProps) {
  const trapRef = useFocusTrap(open);
  const [format, setFormat] = useState<ScreenshotFormat>("png");
  const [quality, setQuality] = useState(92);
  const [transparent, setTransparent] = useState(false);

  if (!open) return null;

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal
      aria-label="Export screenshot"
    >
      <div className={styles.dialog} ref={trapRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>Export 3D screenshot</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className={styles.body}>
          <label className={styles.row}>
            <span>Format</span>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ScreenshotFormat)}
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
            </select>
          </label>
          {format === "jpeg" && (
            <label className={styles.row}>
              <span>Quality ({quality}%)</span>
              <input
                type="range"
                min={50}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
              />
            </label>
          )}
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={transparent}
              disabled={format === "jpeg"}
              onChange={(e) => setTransparent(e.target.checked)}
            />
            <span>Transparent background {format === "jpeg" ? "(PNG only)" : ""}</span>
          </label>
        </div>
        <div className={styles.footer}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onExport({
                format,
                quality: quality / 100,
                transparentBackground: transparent && format === "png",
              });
              onClose();
            }}
          >
            Export
          </Button>
        </div>
      </div>
    </div>
  );
}
