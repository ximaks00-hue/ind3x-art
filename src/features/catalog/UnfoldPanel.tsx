import { useEffect, useMemo, useState } from "react";

import type { RenderableModel, RenderFace } from "../../ipc/types";
import { formatFaceDirection } from "../../app/studioStatusLabels";
import { getTextureCanvas, getOriginalTextureCanvas } from "../editor/textureDocument";
import { useEditorStore } from "../../state/editorStore";
import type { HoveredFace, SelectedFace } from "../../state/selectionStore";
import { useSelectionStore } from "../../state/selectionStore";
import { faceUvRegion } from "../viewer3d/uvMapping";
import {
  CUBE_FACE_ORDER,
  CUBE_UNFOLD_GRID_COLS,
  CUBE_UNFOLD_GRID_ROWS,
  CUBE_FACE_SLOTS,
} from "./cubeUnfoldLayout";
import styles from "./UnfoldPanel.module.css";

interface UnfoldPanelProps {
  model: RenderableModel;
  selectedFace: SelectedFace | null;
  onSelectFace: (cuboidIndex: number, faceIndex: number) => void;
}

interface FaceCell {
  direction: string;
  cuboidIndex: number;
  faceIndex: number;
  face: RenderFace;
}

function findFaceByDirection(
  model: RenderableModel,
  cuboidIndex: number,
  direction: string,
): FaceCell | null {
  const cuboid = model.cuboids[cuboidIndex];
  if (!cuboid) return null;
  const faceIndex = cuboid.faces.findIndex((face) => face.direction === direction);
  if (faceIndex < 0) return null;
  const face = cuboid.faces[faceIndex]!;
  return { direction, cuboidIndex, faceIndex, face };
}

function facePreviewUrl(face: RenderFace, revision: number): string | null {
  void revision;
  const source = getTextureCanvas(face.texture) ?? getOriginalTextureCanvas(face.texture);
  if (!source) return null;

  const region = faceUvRegion(face, source.width, source.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, region.width);
  canvas.height = Math.max(1, region.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    source,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas.toDataURL("image/png");
}

function isSameFace(
  a: { cuboidIndex: number; faceIndex: number } | null | undefined,
  b: { cuboidIndex: number; faceIndex: number } | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.cuboidIndex === b.cuboidIndex && a.faceIndex === b.faceIndex;
}

export function UnfoldPanel({ model, selectedFace, onSelectFace }: UnfoldPanelProps) {
  const revision = useEditorStore((s) => s.revision);
  const hoveredFace = useSelectionStore((s) => s.hoveredFace);
  const setHoveredFace = useSelectionStore((s) => s.setHoveredFace);
  const cuboidIndex = selectedFace?.cuboidIndex ?? 0;
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});

  const faces = useMemo(
    () =>
      CUBE_FACE_ORDER.map((direction) => ({
        direction,
        cell: findFaceByDirection(model, cuboidIndex, direction),
      })),
    [model, cuboidIndex],
  );

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const { direction, cell } of faces) {
      if (!cell) continue;
      const url = facePreviewUrl(cell.face, revision);
      if (url) next[direction] = url;
    }
    setPreviewUrls(next);
  }, [faces, revision]);

  const handleHover = (cell: FaceCell | null, active: boolean) => {
    if (!cell) {
      setHoveredFace(null);
      return;
    }
    const next: HoveredFace = {
      cuboidIndex: cell.cuboidIndex,
      faceIndex: cell.faceIndex,
    };
    setHoveredFace(active ? next : null);
  };

  return (
    <section
      className={styles.panel}
      data-tour="tour-unfold-panel"
      aria-label="UV unfold"
    >
      <header className={styles.header}>
        <h3 className={styles.title}>Unfold</h3>
        <span className={styles.hint}>Click a face · syncs with 3D</span>
      </header>
      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `repeat(${CUBE_UNFOLD_GRID_COLS}, 44px)`,
          gridTemplateRows: `repeat(${CUBE_UNFOLD_GRID_ROWS}, 44px)`,
        }}
      >
        {faces.map(({ direction, cell }) => {
          if (!cell) return null;
          const slot = CUBE_FACE_SLOTS[direction];
          const selected = isSameFace(selectedFace, cell);
          const hovered = isSameFace(hoveredFace, cell);
          const preview = previewUrls[direction];

          return (
            <button
              key={`${cell.cuboidIndex}:${cell.faceIndex}`}
              type="button"
              className={[
                styles.face,
                selected ? styles.faceSelected : "",
                hovered ? styles.faceHovered : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                gridColumn: slot.col + 1,
                gridRow: slot.row + 1,
              }}
              title={formatFaceDirection(cell.direction)}
              aria-label={formatFaceDirection(cell.direction)}
              aria-pressed={selected}
              onClick={() => onSelectFace(cell.cuboidIndex, cell.faceIndex)}
              onMouseEnter={() => handleHover(cell, true)}
              onMouseLeave={() => handleHover(cell, false)}
            >
              {preview ? (
                <img src={preview} alt="" className={styles.preview} draggable={false} />
              ) : (
                <span className={styles.placeholder} />
              )}
              <span className={styles.label}>{formatFaceDirection(cell.direction)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
