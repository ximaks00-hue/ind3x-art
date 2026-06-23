import { useCallback, useEffect, useRef, useState } from "react";

import type { ProjectHandle } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { faceUvRegion } from "../viewer3d/uvMapping";
import {
  ensureTextureDocument,
  getOriginalTextureCanvas,
  getTextureCanvas,
  subscribeTextureDocuments,
} from "./textureDocument";
import styles from "./TextureComparator.module.css";

interface TextureComparatorProps {
  handle: ProjectHandle;
  selectedFace: SelectedFace;
}

export function TextureComparator({ handle, selectedFace }: TextureComparatorProps) {
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const afterRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(8);
  const [split, setSplit] = useState(50);

  const faceForRegion = useCallback(
    () => ({
      direction: selectedFace.direction,
      uv: selectedFace.uv,
      texture: selectedFace.texturePath,
      rotation: selectedFace.rotation,
      tintindex: selectedFace.tintindex,
    }),
    [selectedFace],
  );

  const drawFaceRegion = useCallback(
    (
      target: CanvasRenderingContext2D,
      source: HTMLCanvasElement,
      face: ReturnType<typeof faceForRegion>,
      zoomLevel: number,
    ) => {
      const region = faceUvRegion(face, source.width, source.height);
      const width = Math.max(1, region.width * zoomLevel);
      const height = Math.max(1, region.height * zoomLevel);
      target.canvas.width = width;
      target.canvas.height = height;
      target.imageSmoothingEnabled = false;
      target.clearRect(0, 0, width, height);
      target.drawImage(
        source,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        width,
        height,
      );
    },
    [],
  );

  const render = useCallback(() => {
    const beforeCanvas = beforeRef.current;
    const afterCanvas = afterRef.current;
    const before = getOriginalTextureCanvas(selectedFace.texturePath);
    const after = getTextureCanvas(selectedFace.texturePath);
    if (!beforeCanvas || !afterCanvas || !before || !after) return;

    const beforeCtx = beforeCanvas.getContext("2d");
    const afterCtx = afterCanvas.getContext("2d");
    if (!beforeCtx || !afterCtx) return;

    const face = faceForRegion();
    drawFaceRegion(beforeCtx, before, face, zoom);
    drawFaceRegion(afterCtx, after, face, zoom);
  }, [drawFaceRegion, faceForRegion, selectedFace.texturePath, zoom]);

  useEffect(() => {
    let cancelled = false;
    void ensureTextureDocument(handle, selectedFace.texturePath).then(() => {
      if (!cancelled) {
        setReady(true);
        render();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [handle, selectedFace.texturePath, render]);

  useEffect(() => {
    return subscribeTextureDocuments(() => render());
  }, [render]);

  useEffect(() => {
    render();
  }, [render, ready]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!draggingRef.current || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      setSplit(Math.min(95, Math.max(5, x)));
    };

    const onUp = () => {
      draggingRef.current = false;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  return (
    <div className={styles.wrap}>
      <div className={styles.zoomRow}>
        <label className={styles.zoomLabel}>
          Zoom
          <input
            type="range"
            min={2}
            max={24}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <span className={styles.zoomValue}>{zoom}×</span>
      </div>

      <div ref={frameRef} className={styles.compareFrame}>
        <canvas ref={afterRef} className={styles.layer} aria-label="After" />
        <div className={styles.beforeClip} style={{ width: `${split}%` }}>
          <canvas ref={beforeRef} className={styles.layer} aria-label="Before" />
        </div>
        <div
          className={styles.divider}
          style={{ left: `${split}%` }}
          onPointerDown={(event) => {
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          role="separator"
          aria-orientation="vertical"
          aria-valuenow={split}
          aria-label="Compare divider"
        />
        <span className={styles.labelBefore}>Before</span>
        <span className={styles.labelAfter}>After</span>
      </div>

      <p className={styles.hint}>
        Drag the divider to compare original vs edited pixels.
      </p>
    </div>
  );
}
