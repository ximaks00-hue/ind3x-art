import { useState } from "react";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { formatFaceDirection } from "../../app/studioStatusLabels";
import type { SelectedFace } from "../../state/selectionStore";
import { useEditorStore } from "../../state/editorStore";
import { safeVoid } from "../../lib/safeVoid";
import { buildModelFaceNav } from "../catalog/modelFaceNav";
import { copyFaceUvToTarget, type FaceUvTransform } from "./faceUvTransfer";
import styles from "./FaceTransferBar.module.css";

interface FaceTransferBarProps {
  handle: ProjectHandle;
  model: RenderableModel;
  selectedFace: SelectedFace;
}

export function FaceTransferBar({ handle, model, selectedFace }: FaceTransferBarProps) {
  const bumpRevision = useEditorStore((s) => s.bumpRevision);
  const [busy, setBusy] = useState(false);

  const sameCuboidFaces = buildModelFaceNav(model).filter(
    (item) =>
      item.cuboidIndex === selectedFace.cuboidIndex &&
      !(item.cuboidIndex === selectedFace.cuboidIndex && item.faceIndex === selectedFace.faceIndex),
  );

  if (sameCuboidFaces.length === 0) return null;

  const runCopy = async (targetFaceIndex: number, transform: FaceUvTransform) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await copyFaceUvToTarget(
        handle,
        model,
        selectedFace,
        selectedFace.cuboidIndex,
        targetFaceIndex,
        transform,
      );
      if (ok) bumpRevision();
    } catch (error) {
      console.warn("[FaceTransferBar] copy failed", error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.bar} data-tour="tour-face-transfer">
      <span className={styles.label}>Copy face to</span>
      <div className={styles.actions}>
        {sameCuboidFaces.map((face) => (
          <button
            key={face.id}
            type="button"
            className={styles.btn}
            disabled={busy}
            title={`Copy ${formatFaceDirection(selectedFace.direction)} → ${formatFaceDirection(face.direction)}`}
            onClick={() => safeVoid(runCopy(face.faceIndex, "copy"), "FaceTransferBar.copy")}
          >
            {formatFaceDirection(face.direction)}
          </button>
        ))}
      </div>
      <div className={styles.mirrorRow}>
        <span className={styles.mirrorLabel}>Mirror copy</span>
        {sameCuboidFaces.slice(0, 3).map((face) => (
          <span key={`m-${face.id}`} className={styles.mirrorGroup}>
            <button
              type="button"
              className={styles.mirrorBtn}
              disabled={busy}
              onClick={() => safeVoid(runCopy(face.faceIndex, "mirrorH"), "FaceTransferBar.mirrorH")}
            >
              ↔ {formatFaceDirection(face.direction)}
            </button>
            <button
              type="button"
              className={styles.mirrorBtn}
              disabled={busy}
              onClick={() => safeVoid(runCopy(face.faceIndex, "mirrorV"), "FaceTransferBar.mirrorV")}
            >
              ↕ {formatFaceDirection(face.direction)}
            </button>
            <button
              type="button"
              className={styles.mirrorBtn}
              disabled={busy}
              onClick={() => safeVoid(runCopy(face.faceIndex, "rotate90"), "FaceTransferBar.rotate90")}
            >
              ↻ {formatFaceDirection(face.direction)}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
