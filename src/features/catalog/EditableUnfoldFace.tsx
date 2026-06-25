import { useCallback, useLayoutEffect, useRef } from "react";

import type { RenderFace } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { useProjectStore } from "../../state/projectStore";
import { buildPaintStrokeContext, paintAtTexturePixel } from "../editor/paintInteraction";
import { getTextureCanvas } from "../editor/textureDocument";
import { faceUvRegion } from "../viewer3d/uvMapping";
import { drawFacePreviewToCanvas } from "./unfoldFacePreview";
import styles from "./UnfoldPanel.module.css";

interface EditableUnfoldFaceProps {
  face: RenderFace;
  refreshToken: number;
  editable: boolean;
  onPaintStroke?: () => void;
}

function localToTexturePixel(
  localX: number,
  localY: number,
  canvas: HTMLCanvasElement,
  face: RenderFace,
  source: HTMLCanvasElement,
): [number, number] | null {
  const region = faceUvRegion(face, source.width, source.height);
  const tx = region.x + Math.floor((localX / canvas.width) * region.width);
  const ty = region.y + Math.floor((localY / canvas.height) * region.height);
  if (
    tx < region.x ||
    ty < region.y ||
    tx >= region.x + region.width ||
    ty >= region.y + region.height
  ) {
    return null;
  }
  return [tx, ty];
}

export function EditableUnfoldFace({
  face,
  refreshToken,
  editable,
  onPaintStroke,
}: EditableUnfoldFaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef(false);
  const lastPixelRef = useRef<[number, number] | null>(null);
  const handle = useProjectStore((s) => s.handle);
  const bumpRevision = useEditorStore((s) => s.bumpRevision);
  const tool = useEditorStore((s) => s.tool);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawFacePreviewToCanvas(canvas, face);
  }, [face, refreshToken]);

  const paintAt = useCallback(
    async (tx: number, ty: number, isStroke: boolean) => {
      if (!handle) return;
      const ctx = buildPaintStrokeContext(handle, face.texture);
      await paintAtTexturePixel(
        ctx,
        tx,
        ty,
        isStroke,
        lastPixelRef.current ? { x: lastPixelRef.current[0], y: lastPixelRef.current[1] } : null,
      );
      lastPixelRef.current = [tx, ty];
      bumpRevision();
      onPaintStroke?.();
    },
    [handle, face.texture, bumpRevision, onPaintStroke],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editable || !handle) return;
    if (tool === "select" || tool === "move") return;
    event.stopPropagation();
    const canvas = canvasRef.current;
    const source = getTextureCanvas(face.texture);
    if (!canvas || !source) return;

    const rect = canvas.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const localY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const point = localToTexturePixel(localX, localY, canvas, face, source);
    if (!point) return;

    paintingRef.current = true;
    lastPixelRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    void paintAt(point[0], point[1], false);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current || !editable) return;
    event.stopPropagation();
    const canvas = canvasRef.current;
    const source = getTextureCanvas(face.texture);
    if (!canvas || !source) return;

    const rect = canvas.getBoundingClientRect();
    const localX = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const localY = ((event.clientY - rect.top) / rect.height) * canvas.height;
    const point = localToTexturePixel(localX, localY, canvas, face, source);
    if (!point) return;
    void paintAt(point[0], point[1], true);
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    paintingRef.current = false;
    lastPixelRef.current = null;
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <canvas
      ref={canvasRef}
      className={[styles.preview, editable ? styles.previewEditable : ""].filter(Boolean).join(" ")}
      aria-hidden={!editable}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerLeave={endStroke}
    />
  );
}
