import { useCallback, useEffect, useRef, useState } from "react";

import type { ProjectHandle } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { useEditorStore } from "../../state/editorStore";
import { faceUvRegion } from "../viewer3d/uvMapping";
import {
  collectStrokeChanges,
  ellipseToolChanges,
  floodFillChanges,
  linePixels,
  lineToolChanges,
  magicWandSelection,
  pickColor,
  rectToolChanges,
} from "./tools";
import {
  canRedo,
  canUndo,
  commitChanges,
  ensureTextureDocument,
  getActiveLayerId,
  getTextureCanvas,
  subscribeTextureDocuments,
} from "./textureDocument";
import { usePixelWorker } from "./usePixelWorker";
import { useViewerStore } from "../../state/viewerStore";
import styles from "./TextureCanvas.module.css";

interface TextureCanvasProps {
  handle: ProjectHandle;
  selectedFace: SelectedFace;
}

function hexToRgbaInline(hex: string): [number, number, number, number] {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

function getActiveLayerIdForPath(path: string): string | null {
  return getActiveLayerId(path);
}

function canvasToTexture(
  localX: number,
  localY: number,
  region: { x: number; y: number; width: number; height: number },
  canvasW: number,
  canvasH: number,
): [number, number] {
  const tx = region.x + Math.floor((localX / canvasW) * region.width);
  const ty = region.y + Math.floor((localY / canvasH) * region.height);
  return [tx, ty];
}

function isShapeTool(tool: string): tool is "line" | "rect" | "ellipse" {
  return tool === "line" || tool === "rect" || tool === "ellipse";
}

function isSelectionTool(tool: string): tool is "select" | "move" {
  return tool === "select" || tool === "move";
}

export function TextureCanvas(props: TextureCanvasProps) {
  return <TextureCanvasInner key={props.selectedFace.texturePath} {...props} />;
}

function TextureCanvasInner({ handle, selectedFace }: TextureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef(false);
  const lastPixelRef = useRef<[number, number] | null>(null);
  const shapeStartRef = useRef<[number, number] | null>(null);

  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const setColor = useEditorStore((s) => s.setColor);
  const symmetryX = useEditorStore((s) => s.symmetryX);
  const rectFilled = useEditorStore((s) => s.rectFilled);
  const revision = useEditorStore((s) => s.revision);
  const bumpRevision = useEditorStore((s) => s.bumpRevision);
  const pushRecentColor = useEditorStore((s) => s.pushRecentColor);
  // zoom and cursor are shared with the status bar via editorStore
  const zoom = useEditorStore((s) => s.zoom);
  const setZoom = useEditorStore((s) => s.setZoom);
  const setCursor = useEditorStore((s) => s.setCursor);
  const activeFrame = useEditorStore((s) => s.activeFrame);
  const pixelWorkerRef = usePixelWorker();
  const activeTextureMeta = useViewerStore((s) => s.activeTextureMeta);

  const selection = useEditorStore((s) => s.selection);
  const setSelection = useEditorStore((s) => s.setSelection);
  const [ready, setReady] = useState(false);
  const [hoverPixel, setHoverPixel] = useState<[number, number] | null>(null);
  // Local ref mirrors store selection for use during pointer drag (avoids stale closure)
  const selectionRef = useRef<[number, number, number, number] | null>(null);
  // Clipboard for move: pixels captured from the selection
  const moveBufferRef = useRef<{
    pixels: Map<string, string>;
    x0: number;
    y0: number;
    w: number;
    h: number;
  } | null>(null);

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

  const renderCanvas = useCallback(() => {
    const view = canvasRef.current;
    const source = getTextureCanvas(selectedFace.texturePath);
    if (!view || !source) return;

    const region = faceUvRegion(faceForRegion(), source.width, source.height);

    // For animated textures, clamp region to the correct frame strip
    const animMeta = activeTextureMeta[selectedFace.texturePath]?.animation;
    let srcRegion = region;
    if (animMeta && animMeta.frames.length > 0) {
      const frameH = animMeta.frameHeight || source.height / animMeta.frames.length;
      const frameIdx = Math.min(activeFrame, animMeta.frames.length - 1);
      const frameRow = animMeta.frames[frameIdx] ?? frameIdx;
      const offsetY = frameRow * frameH;
      srcRegion = {
        x: region.x,
        y: offsetY + region.y,
        width: region.width,
        height: Math.min(region.height, frameH),
      };
    }

    const scale = Math.min(zoom, 16);
    view.width = Math.max(1, srcRegion.width * scale);
    view.height = Math.max(1, srcRegion.height * scale);

    const overlay = overlayRef.current;
    if (overlay) {
      overlay.width = view.width;
      overlay.height = view.height;
    }

    const ctx = view.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, view.width, view.height);
    ctx.drawImage(
      source,
      srcRegion.x,
      srcRegion.y,
      srcRegion.width,
      srcRegion.height,
      0,
      0,
      view.width,
      view.height,
    );

    if (scale >= 4) {
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      for (let x = 0; x <= srcRegion.width; x += 1) {
        const px = (x / srcRegion.width) * view.width;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, view.height);
      }
      for (let y = 0; y <= srcRegion.height; y += 1) {
        const py = (y / srcRegion.height) * view.height;
        ctx.moveTo(0, py);
        ctx.lineTo(view.width, py);
      }
      ctx.stroke();
    }
  }, [selectedFace.texturePath, zoom, faceForRegion, activeFrame, activeTextureMeta]);

  const clearOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }, []);

  const drawSelectionOverlay = useCallback(
    (sel: [number, number, number, number] | null) => {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      if (!sel) return;

      const source = getTextureCanvas(selectedFace.texturePath);
      if (!source) return;
      const region = faceUvRegion(faceForRegion(), source.width, source.height);
      const scaleX = overlay.width / region.width;
      const scaleY = overlay.height / region.height;

      const [x0, y0, x1, y1] = [
        Math.min(sel[0], sel[2]),
        Math.min(sel[1], sel[3]),
        Math.max(sel[0], sel[2]),
        Math.max(sel[1], sel[3]),
      ];
      const rx = (x0 - region.x) * scaleX;
      const ry = (y0 - region.y) * scaleY;
      const rw = (x1 - x0 + 1) * scaleX;
      const rh = (y1 - y0 + 1) * scaleY;

      ctx.strokeStyle = "rgba(80,160,255,0.9)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = "rgba(80,160,255,0.10)";
      ctx.fillRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
    },
    [selectedFace.texturePath, faceForRegion],
  );

  const drawShapePreview = useCallback(
    (end: [number, number]) => {
      const start = shapeStartRef.current;
      const overlay = overlayRef.current;
      const view = canvasRef.current;
      const source = getTextureCanvas(selectedFace.texturePath);
      if (!start || !overlay || !view || !source) return;

      const region = faceUvRegion(faceForRegion(), source.width, source.height);
      const ctx = overlay.getContext("2d");
      if (!ctx) return;

      const toLocal = ([tx, ty]: [number, number]): [number, number] => [
        ((tx - region.x) / region.width) * view.width,
        ((ty - region.y) / region.height) * view.height,
      ];

      const [x0, y0] = toLocal(start);
      const [x1, y1] = toLocal(end);

      clearOverlay();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.85;

      if (tool === "line") {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      } else if (tool === "ellipse") {
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const rx = Math.abs(x1 - x0) / 2;
        const ry = Math.abs(y1 - y0) / 2;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (rectFilled) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.35;
          ctx.fill();
          ctx.globalAlpha = 0.85;
        }
        ctx.stroke();
      } else {
        const left = Math.min(x0, x1);
        const top = Math.min(y0, y1);
        const w = Math.abs(x1 - x0);
        const h = Math.abs(y1 - y0);
        if (rectFilled) {
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.35;
          ctx.fillRect(left, top, w, h);
          ctx.globalAlpha = 0.85;
        }
        ctx.strokeRect(left, top, w, h);
      }
    },
    [clearOverlay, color, faceForRegion, rectFilled, selectedFace.texturePath, tool],
  );

  useEffect(() => {
    let cancelled = false;
    void ensureTextureDocument(handle, selectedFace.texturePath).then(() => {
      if (!cancelled) {
        setReady(true);
        renderCanvas();
        bumpRevision();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [handle, selectedFace.texturePath, renderCanvas, bumpRevision]);

  useEffect(() => subscribeTextureDocuments(renderCanvas), [renderCanvas]);
  useEffect(() => {
    renderCanvas();
  }, [revision, renderCanvas]);

  const applyAt = useCallback(
    (tx: number, ty: number, isStroke: boolean) => {
      const path = selectedFace.texturePath;

      if (tool === "picker") {
        const picked = pickColor(path, tx, ty);
        if (picked) {
          setColor(picked);
          pushRecentColor(picked);
        }
        return;
      }

      if (tool === "fill") {
        const worker = pixelWorkerRef.current;
        const canvas = getTextureCanvas(path);
        if (worker && canvas) {
          // Offload flood fill to worker
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const [fr, fg, fb, fa] = hexToRgbaInline(color);
            worker
              .floodFill({
                imageData,
                startX: tx,
                startY: ty,
                fillR: fr,
                fillG: fg,
                fillB: fb,
                fillA: fa,
                tolerance: 0,
              })
              .then((filled) => {
                // Compute changed pixels by diffing
                const origData = imageData.data;
                const newData = filled.data;
                const changes: Array<{
                  x: number;
                  y: number;
                  before: [number, number, number, number];
                  after: [number, number, number, number];
                  layerId: string;
                }> = [];
                const layerId = getActiveLayerIdForPath(path);
                if (!layerId) return;
                for (let i = 0; i < origData.length; i += 4) {
                  if (
                    origData[i] !== newData[i] ||
                    origData[i + 1] !== newData[i + 1] ||
                    origData[i + 2] !== newData[i + 2] ||
                    origData[i + 3] !== newData[i + 3]
                  ) {
                    const px = (i / 4) % canvas.width;
                    const py = Math.floor(i / 4 / canvas.width);
                    changes.push({
                      x: px,
                      y: py,
                      before: [
                        origData[i],
                        origData[i + 1],
                        origData[i + 2],
                        origData[i + 3],
                      ],
                      after: [newData[i], newData[i + 1], newData[i + 2], newData[i + 3]],
                      layerId,
                    });
                  }
                }
                if (changes.length > 0) {
                  commitChanges(handle, path, changes);
                  bumpRevision();
                }
              })
              .catch(() => {
                // Fallback to synchronous fill on error
                const changes = floodFillChanges(path, tx, ty, color);
                commitChanges(handle, path, changes);
                bumpRevision();
              });
            return;
          }
        }
        // Synchronous fallback
        const changes = floodFillChanges(path, tx, ty, color);
        commitChanges(handle, path, changes);
        bumpRevision();
        return;
      }

      if (tool === "wand") {
        // Magic wand: tolerance flood-select by color proximity
        const TOLERANCE = 30;
        const sel = magicWandSelection(path, tx, ty, TOLERANCE);
        if (sel) {
          setSelection(sel);
          selectionRef.current = sel;
          drawSelectionOverlay(sel);
        }
        return;
      }

      if (isShapeTool(tool)) return;

      const points: [number, number][] =
        isStroke && lastPixelRef.current
          ? linePixels(lastPixelRef.current[0], lastPixelRef.current[1], tx, ty)
          : [[tx, ty]];

      const changes = collectStrokeChanges(path, points, tool, color, symmetryX);
      commitChanges(handle, path, changes);
      lastPixelRef.current = [tx, ty];
      bumpRevision();
    },
    [
      handle,
      selectedFace.texturePath,
      tool,
      color,
      setColor,
      pushRecentColor,
      bumpRevision,
      symmetryX,
      setSelection,
      drawSelectionOverlay,
      pixelWorkerRef,
    ],
  );

  const commitShape = useCallback(
    (end: [number, number]) => {
      const start = shapeStartRef.current;
      if (!start) return;
      const path = selectedFace.texturePath;
      const changes =
        tool === "line"
          ? lineToolChanges(
              path,
              start[0],
              start[1],
              end[0],
              end[1],
              "pencil",
              color,
              symmetryX,
            )
          : tool === "ellipse"
            ? ellipseToolChanges(
                path,
                start[0],
                start[1],
                end[0],
                end[1],
                color,
                rectFilled,
                symmetryX,
              )
            : rectToolChanges(
                path,
                start[0],
                start[1],
                end[0],
                end[1],
                "pencil",
                color,
                rectFilled,
                symmetryX,
              );
      commitChanges(handle, path, changes);
      shapeStartRef.current = null;
      clearOverlay();
      bumpRevision();
    },
    [
      handle,
      selectedFace.texturePath,
      tool,
      color,
      symmetryX,
      rectFilled,
      clearOverlay,
      bumpRevision,
    ],
  );

  const pointerToTexture = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): [number, number] | null => {
      const view = canvasRef.current;
      const source = getTextureCanvas(selectedFace.texturePath);
      if (!view || !source) return null;

      const rect = view.getBoundingClientRect();
      const localX = ((event.clientX - rect.left) / rect.width) * view.width;
      const localY = ((event.clientY - rect.top) / rect.height) * view.height;

      const region = faceUvRegion(faceForRegion(), source.width, source.height);

      return canvasToTexture(localX, localY, region, view.width, view.height);
    },
    [selectedFace.texturePath, faceForRegion],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!ready) return;
    const point = pointerToTexture(event);
    if (!point) return;

    paintingRef.current = true;
    lastPixelRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (isSelectionTool(tool)) {
      if (tool === "move" && selection) {
        // Begin dragging: capture pixels in selection into moveBuffer
        const path = selectedFace.texturePath;
        const canvas = getTextureCanvas(path);
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const [sx0, sy0, sx1, sy1] = [
              Math.min(selection[0], selection[2]),
              Math.min(selection[1], selection[3]),
              Math.max(selection[0], selection[2]),
              Math.max(selection[1], selection[3]),
            ];
            const w = sx1 - sx0 + 1;
            const h = sy1 - sy0 + 1;
            const data = ctx.getImageData(sx0, sy0, w, h);
            const pixels = new Map<string, string>();
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const [r, g, b, a] = [
                  data.data[i],
                  data.data[i + 1],
                  data.data[i + 2],
                  data.data[i + 3],
                ];
                pixels.set(`${x},${y}`, `rgba(${r},${g},${b},${a})`);
              }
            }
            moveBufferRef.current = { pixels, x0: sx0, y0: sy0, w, h };
          }
        }
      } else {
        // Begin new selection rect
        selectionRef.current = [point[0], point[1], point[0], point[1]];
        setSelection([point[0], point[1], point[0], point[1]]);
        moveBufferRef.current = null;
      }
      shapeStartRef.current = point;
      return;
    }

    if (isShapeTool(tool)) {
      shapeStartRef.current = point;
      return;
    }

    applyAt(point[0], point[1], false);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerToTexture(event);
    setHoverPixel(point);
    setCursor(point ? point[0] : null, point ? point[1] : null);

    if (!paintingRef.current) return;

    if (isSelectionTool(tool)) {
      if (!point) return;
      const start = shapeStartRef.current;
      if (!start) return;

      if (tool === "move" && moveBufferRef.current) {
        // Show preview of move destination
        const mb = moveBufferRef.current;
        const dx = point[0] - start[0];
        const dy = point[1] - start[1];
        const newSel: [number, number, number, number] = [
          mb.x0 + dx,
          mb.y0 + dy,
          mb.x0 + dx + mb.w - 1,
          mb.y0 + dy + mb.h - 1,
        ];
        drawSelectionOverlay(newSel);
      } else {
        // Grow selection rect
        const newSel: [number, number, number, number] = [
          start[0],
          start[1],
          point[0],
          point[1],
        ];
        selectionRef.current = newSel;
        setSelection(newSel);
        drawSelectionOverlay(newSel);
      }
      return;
    }

    if (isShapeTool(tool)) {
      if (point) drawShapePreview(point);
      return;
    }

    if (tool === "fill" || tool === "picker" || tool === "wand") return;
    if (!point) return;
    applyAt(point[0], point[1], true);
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    paintingRef.current = false;
    lastPixelRef.current = null;

    if (isSelectionTool(tool)) {
      const point = pointerToTexture(event);
      const start = shapeStartRef.current;

      if (tool === "move" && moveBufferRef.current && start && point) {
        const mb = moveBufferRef.current;
        const dx = point[0] - start[0];
        const dy = point[1] - start[1];
        const path = selectedFace.texturePath;
        const changes: import("./textureDocument").PixelChange[] = [];

        // Erase original region
        for (let y = 0; y < mb.h; y++) {
          for (let x = 0; x < mb.w; x++) {
            changes.push({
              x: mb.x0 + x,
              y: mb.y0 + y,
              before: [0, 0, 0, 0],
              after: [0, 0, 0, 0],
              layerId: "",
            });
          }
        }
        // Paint at new position
        for (let y = 0; y < mb.h; y++) {
          for (let x = 0; x < mb.w; x++) {
            const px = mb.x0 + dx + x;
            const py = mb.y0 + dy + y;
            const rgba = mb.pixels.get(`${x},${y}`);
            if (rgba) {
              const m = rgba.match(/rgba?\((\d+),(\d+),(\d+),(\d+)\)/);
              if (m) {
                changes.push({
                  x: px,
                  y: py,
                  before: [0, 0, 0, 0],
                  after: [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])],
                  layerId: "",
                });
              }
            }
          }
        }
        if (changes.length > 0) {
          commitChanges(handle, path, changes);
          bumpRevision();
        }
        const newSel: [number, number, number, number] = [
          mb.x0 + dx,
          mb.y0 + dy,
          mb.x0 + dx + mb.w - 1,
          mb.y0 + dy + mb.h - 1,
        ];
        setSelection(newSel);
        drawSelectionOverlay(newSel);
        moveBufferRef.current = null;
      } else {
        if (selectionRef.current) drawSelectionOverlay(selectionRef.current);
      }
      shapeStartRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    if (isShapeTool(tool)) {
      const point = pointerToTexture(event);
      if (point && shapeStartRef.current) commitShape(point);
      else clearOverlay();
      shapeStartRef.current = null;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.zoomRow}>
        <label className={styles.zoomLabel}>
          Zoom
          <input
            type="range"
            min={1}
            max={32}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
        <span className={styles.zoomValue}>{zoom}×</span>
        {hoverPixel && (
          <span className={styles.coord}>
            ({hoverPixel[0]}, {hoverPixel[1]})
          </span>
        )}
      </div>
      <div className={styles.canvasFrame}>
        <canvas ref={canvasRef} className={styles.canvas} />
        <canvas
          ref={overlayRef}
          className={styles.overlay}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={(e) => {
            endStroke(e);
            setHoverPixel(null);
            setCursor(null, null);
          }}
        />
      </div>
      <div className={styles.historyRow}>
        <span className={styles.historyHint}>
          Undo Ctrl+Z · Shift+fill rect · Symmetry X
        </span>
        <span className={styles.historyState}>
          {canUndo(selectedFace.texturePath) ? "edited" : "clean"}
          {canRedo(selectedFace.texturePath) ? " · redo available" : ""}
        </span>
      </div>
    </div>
  );
}
