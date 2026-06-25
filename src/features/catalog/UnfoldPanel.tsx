import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import type { RenderableModel, RenderFace } from "../../ipc/types";
import { formatFaceDirection } from "../../app/studioStatusLabels";
import { useEditorStore } from "../../state/editorStore";
import type { HoveredFace, SelectedFace } from "../../state/selectionStore";
import { useSelectionStore } from "../../state/selectionStore";
import { UNFOLD_HEADER_HINT } from "./faceEditingGuide";
import { EditableUnfoldFace } from "./EditableUnfoldFace";
import {
  CUBE_FACE_ORDER,
  CUBE_UNFOLD_GRID_COLS,
  CUBE_UNFOLD_GRID_ROWS,
  CUBE_FACE_SLOTS,
} from "./cubeUnfoldLayout";
import { drawFacePreviewToCanvas } from "./unfoldFacePreview";
import styles from "./UnfoldPanel.module.css";

interface UnfoldPanelProps {
  model: RenderableModel;
  selectedFace: SelectedFace | null;
  onSelectFace: (cuboidIndex: number, faceIndex: number) => void;
  editable?: boolean;
}

interface FaceCell {
  direction: string;
  cuboidIndex: number;
  faceIndex: number;
  face: RenderFace;
}

const UNFOLD_PREVIEW_DEBOUNCE_MS = 120;
const EDITABLE_CELL_PX = 64;

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

function isSameFace(
  a: { cuboidIndex: number; faceIndex: number } | null | undefined,
  b: { cuboidIndex: number; faceIndex: number } | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.cuboidIndex === b.cuboidIndex && a.faceIndex === b.faceIndex;
}

function FacePreviewCanvas({
  face,
  refreshToken,
}: {
  face: RenderFace;
  refreshToken: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [missing, setMissing] = useState(false);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const drew = drawFacePreviewToCanvas(canvas, face);
    setMissing(!drew);
  }, [face, refreshToken]);

  if (missing) {
    return <span className={styles.placeholder} />;
  }

  return <canvas ref={canvasRef} className={styles.preview} aria-hidden />;
}

export function UnfoldPanel({
  model,
  selectedFace,
  onSelectFace,
  editable = false,
}: UnfoldPanelProps) {
  const revision = useEditorStore((s) => s.revision);
  const hoveredFace = useSelectionStore((s) => s.hoveredFace);
  const setHoveredFace = useSelectionStore((s) => s.setHoveredFace);
  const cuboidIndex = selectedFace?.cuboidIndex ?? 0;

  const itemTexturePath =
    model.cuboids.length === 0 && model.kind === "itemGenerated"
      ? Object.values(model.textureRefs)[0]
      : undefined;

  const faces = useMemo(() => {
    if (itemTexturePath) {
      const syntheticFace: RenderFace = {
        direction: "up",
        uv: [0, 0, 16, 16],
        texture: itemTexturePath,
        rotation: 0,
        tintindex: 0,
        cullface: null,
      };
      const cell: FaceCell = {
        direction: "up",
        cuboidIndex: 0,
        faceIndex: 0,
        face: syntheticFace,
      };
      return CUBE_FACE_ORDER.map((direction) => ({
        direction,
        cell: direction === "up" ? cell : null,
      }));
    }
    return CUBE_FACE_ORDER.map((direction) => ({
      direction,
      cell: findFaceByDirection(model, cuboidIndex, direction),
    }));
  }, [model, cuboidIndex, itemTexturePath]);

  const [debouncedRevision, setDebouncedRevision] = useState(revision);

  const cellPx = editable ? EDITABLE_CELL_PX : 44;

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedRevision(revision),
      UNFOLD_PREVIEW_DEBOUNCE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [revision]);

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

  const selectedDirection = selectedFace?.direction ?? null;

  return (
    <section
      className={[styles.panel, editable ? styles.panelEditable : ""].filter(Boolean).join(" ")}
      data-tour="tour-unfold-panel"
      aria-label="UV unfold"
    >
      <header className={styles.header}>
        <h3 className={styles.title}>Unfold</h3>
        <span className={styles.hint}>
          {editable ? "Paint on mini canvases · click to switch face" : UNFOLD_HEADER_HINT}
        </span>
      </header>
      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `repeat(${CUBE_UNFOLD_GRID_COLS}, ${cellPx}px)`,
          gridTemplateRows: `repeat(${CUBE_UNFOLD_GRID_ROWS}, ${cellPx}px)`,
        }}
      >
        {faces.map(({ direction, cell }) => {
          if (!cell) return null;
          const slot = CUBE_FACE_SLOTS[direction];
          const selected = isSameFace(selectedFace, cell);
          const hovered = isSameFace(hoveredFace, cell);
          const refreshToken =
            selectedDirection === direction ? revision : debouncedRevision;

          return (
            <button
              key={`${cell.cuboidIndex}:${cell.faceIndex}`}
              type="button"
              className={[
                styles.face,
                editable ? styles.faceEditable : "",
                selected ? styles.faceSelected : "",
                hovered ? styles.faceHovered : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                gridColumn: slot.col + 1,
                gridRow: slot.row + 1,
                width: cellPx,
                height: cellPx,
              }}
              title={formatFaceDirection(cell.direction)}
              aria-label={formatFaceDirection(cell.direction)}
              aria-pressed={selected}
              onClick={() => onSelectFace(cell.cuboidIndex, cell.faceIndex)}
              onMouseEnter={() => handleHover(cell, true)}
              onMouseLeave={() => handleHover(cell, false)}
            >
              {editable ? (
                <EditableUnfoldFace
                  face={cell.face}
                  refreshToken={refreshToken}
                  editable={editable}
                />
              ) : (
                <FacePreviewCanvas face={cell.face} refreshToken={refreshToken} />
              )}
              <span className={styles.label}>{formatFaceDirection(cell.direction)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
