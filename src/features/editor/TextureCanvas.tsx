import { useCallback, useEffect, useRef, useState } from "react";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { useEditorStore, TOOL_LABELS } from "../../state/editorStore";
import { faceUvRegion } from "../viewer3d/uvMapping";
import {
  collectAtlasFaceRegions,
  drawAtlasGuide,
  pointInRegion,
} from "./atlasOverlay";
import { pickColor } from "./tools";
import { beginBrushStroke, commitShapeAt, endBrushStroke } from "./paintEngine";
import {
  buildPaintStrokeContext,
  isShapeTool as isShapeToolShared,
  paintAtTexturePixel,
} from "./paintInteraction";
import { drawShapePreview as drawShapePreviewOnCanvas } from "./shapePreviewDraw";
import {
  canRedo,
  canUndo,
  commitChanges,
  ensureTextureDocument,
  flushIconInvalidations,
  getActiveLayerContext,
  getDoc,
  getLayerPixel,
  getTextureCanvas,
  peekRedoLabel,
  peekUndoLabel,
  subscribeTextureDocuments,
} from "./textureDocument";
import { usePixelWorker } from "./usePixelWorker";
import { useViewerStore } from "../../state/viewerStore";
import { buildMoveSelectionChanges, type MoveBuffer } from "./moveSelection";
import styles from "./TextureCanvas.module.css";
import type { Rgba } from "./textureDocument";

interface TextureCanvasProps {
  handle: ProjectHandle;
  selectedFace: SelectedFace;
  atlasModel?: RenderableModel | null;
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
  return isShapeToolShared(tool as import("../../state/editorStore").EditorTool);
}

function isSelectionTool(tool: string): tool is "select" | "move" {
  return tool === "select" || tool === "move";
}

export function TextureCanvas(props: TextureCanvasProps) {
  return <TextureCanvasInner key={props.selectedFace.texturePath} {...props} />;
}

function TextureCanvasInner({ handle, selectedFace, atlasModel = null }: TextureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLCanvasElement>(null);
  const paintingRef = useRef(false);
  const lastPixelRef = useRef<[number, number] | null>(null);
  const shapeStartRef = useRef<[number, number] | null>(null);
  const cursorRafRef = useRef<number | null>(null);
  const pendingCursorPointRef = useRef<[number, number] | null>(null);

  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const setColor = useEditorStore((s) => s.setColor);
  const brushSize = useEditorStore((s) => s.brushSize);
  const stabilizer = useEditorStore((s) => s.stabilizer);
  const onionSkin = useEditorStore((s) => s.onionSkin);
  const atlasGuide = useEditorStore((s) => s.atlasGuide);
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
  const moveBufferRef = useRef<MoveBuffer | null>(null);
  const stabilizerRef = useRef<[number, number][]>([]);

  const paintCtx = useCallback(
    () => buildPaintStrokeContext(handle, selectedFace.texturePath),
    [handle, selectedFace.texturePath],
  );

  const faceForRegion = useCallback(
    () => ({
      direction: selectedFace.direction,
      uv: selectedFace.uv,
      texture: selectedFace.texturePath,
      rotation: selectedFace.rotation,
      tintindex: selectedFace.tintindex,
      cullface: null,
    }),
    [selectedFace],
  );

  const useAtlasView = Boolean(atlasGuide && atlasModel);

  const renderCanvas = useCallback(() => {
    const view = canvasRef.current;
    const source = getTextureCanvas(selectedFace.texturePath);
    if (!view || !source) return;

    const faceRegion = faceUvRegion(faceForRegion(), source.width, source.height);
    const region = useAtlasView
      ? { x: 0, y: 0, width: source.width, height: source.height }
      : faceRegion;

    // For animated textures, clamp region to the correct frame strip
    const animMeta = activeTextureMeta[selectedFace.texturePath]?.animation;
    let srcRegion = region;
    if (!useAtlasView && animMeta && animMeta.frames.length > 0) {
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

    const scale = zoom;
    view.width = Math.max(1, srcRegion.width * scale);
    view.height = Math.max(1, srcRegion.height * scale);

    const overlay = overlayRef.current;
    if (overlay) {
      overlay.width = view.width;
      overlay.height = view.height;
    }

    const cursor = cursorRef.current;
    if (cursor) {
      cursor.width = view.width;
      cursor.height = view.height;
    }

    const ctx = view.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, view.width, view.height);

    const drawRegion = (
      regionSlice: { x: number; y: number; width: number; height: number },
      alpha = 1,
    ) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.drawImage(
        source,
        regionSlice.x,
        regionSlice.y,
        regionSlice.width,
        regionSlice.height,
        0,
        0,
        view.width,
        view.height,
      );
      ctx.restore();
    };

    if (!useAtlasView && animMeta && animMeta.frames.length > 0 && onionSkin) {
      const frameH = animMeta.frameHeight || source.height / animMeta.frames.length;
      const prevIdx = (activeFrame - 1 + animMeta.frames.length) % animMeta.frames.length;
      const nextIdx = (activeFrame + 1) % animMeta.frames.length;
      for (const [idx, alpha] of [
        [prevIdx, 0.28],
        [nextIdx, 0.22],
      ] as const) {
        const row = animMeta.frames[idx] ?? idx;
        drawRegion(
          {
            x: faceRegion.x,
            y: row * frameH + faceRegion.y,
            width: faceRegion.width,
            height: Math.min(faceRegion.height, frameH),
          },
          alpha,
        );
      }
    }

    drawRegion(srcRegion, 1);

    if (!useAtlasView && scale >= 4) {
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

    if (useAtlasView && atlasModel) {
      const overlay = overlayRef.current;
      const octx = overlay?.getContext("2d");
      if (overlay && octx) {
        octx.clearRect(0, 0, overlay.width, overlay.height);
        const regions = collectAtlasFaceRegions(
          atlasModel,
          selectedFace.texturePath,
          source.width,
          source.height,
          selectedFace,
        );
        drawAtlasGuide(octx, regions, view.width, view.height, source.width, source.height);
      }
    }
  }, [
    selectedFace.texturePath,
    selectedFace,
    zoom,
    faceForRegion,
    activeFrame,
    activeTextureMeta,
    onionSkin,
    useAtlasView,
    atlasModel,
  ]);

  const drawBrushCursor = useCallback(
    (point: [number, number] | null) => {
      const cursor = cursorRef.current;
      if (!cursor) return;
      const ctx = cursor.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, cursor.width, cursor.height);
      if (!point) return;

      const source = getTextureCanvas(selectedFace.texturePath);
      if (!source) return;
      const region = useAtlasView
        ? { x: 0, y: 0, width: source.width, height: source.height }
        : faceUvRegion(faceForRegion(), source.width, source.height);
      const scaleX = cursor.width / region.width;
      const scaleY = cursor.height / region.height;
      const lx = useAtlasView ? (point[0] / source.width) * cursor.width : (point[0] - region.x) * scaleX;
      const ly = useAtlasView ? (point[1] / source.height) * cursor.height : (point[1] - region.y) * scaleY;
      const r = (brushSize / 2) * scaleX;
      ctx.strokeStyle = "rgba(99, 140, 255, 0.85)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(lx, ly, Math.max(1, r), 0, Math.PI * 2);
      ctx.stroke();
    },
    [brushSize, faceForRegion, selectedFace.texturePath, useAtlasView],
  );

  const scheduleBrushCursor = useCallback(
    (point: [number, number] | null) => {
      pendingCursorPointRef.current = point;
      if (cursorRafRef.current != null) return;
      cursorRafRef.current = requestAnimationFrame(() => {
        cursorRafRef.current = null;
        drawBrushCursor(pendingCursorPointRef.current);
      });
    },
    [drawBrushCursor],
  );

  useEffect(
    () => () => {
      if (cursorRafRef.current != null) {
        cancelAnimationFrame(cursorRafRef.current);
      }
    },
    [],
  );

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
      const faceRegion = faceUvRegion(faceForRegion(), source.width, source.height);
      const region = useAtlasView
        ? { x: 0, y: 0, width: source.width, height: source.height }
        : faceRegion;
      const scaleX = overlay.width / region.width;
      const scaleY = overlay.height / region.height;

      const [x0, y0, x1, y1] = [
        Math.min(sel[0], sel[2]),
        Math.min(sel[1], sel[3]),
        Math.max(sel[0], sel[2]),
        Math.max(sel[1], sel[3]),
      ];
      const rx = useAtlasView ? x0 * scaleX : (x0 - region.x) * scaleX;
      const ry = useAtlasView ? y0 * scaleY : (y0 - region.y) * scaleY;
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
    [selectedFace.texturePath, faceForRegion, useAtlasView],
  );

  const drawShapePreview = useCallback(
    (end: [number, number]) => {
      const start = shapeStartRef.current;
      const overlay = overlayRef.current;
      const view = canvasRef.current;
      const source = getTextureCanvas(selectedFace.texturePath);
      if (!start || !overlay || !view || !source || !isShapeTool(tool)) return;

      const faceRegion = faceUvRegion(faceForRegion(), source.width, source.height);
      const region = useAtlasView
        ? { x: 0, y: 0, width: source.width, height: source.height }
        : faceRegion;
      const ctx = overlay.getContext("2d");
      if (!ctx) return;

      drawShapePreviewOnCanvas(
        ctx,
        tool,
        color,
        rectFilled,
        start,
        end,
        region,
        view.width,
        view.height,
      );
    },
    [color, faceForRegion, rectFilled, selectedFace.texturePath, tool, useAtlasView],
  );

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void ensureTextureDocument(handle, selectedFace.texturePath)
      .then(() => {
        if (!cancelled) {
          setReady(true);
          bumpRevision();
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[TextureCanvas] failed to load texture document", error);
          setReady(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [handle, selectedFace.texturePath, bumpRevision]);

  useEffect(() => subscribeTextureDocuments(renderCanvas), [renderCanvas]);
  useEffect(() => {
    if (!ready) return;
    renderCanvas();
  }, [ready, revision, renderCanvas]);

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

      if (tool === "fill" || tool === "wand") {
        void paintAtTexturePixel(paintCtx(), tx, ty, false, null, {
          pixelWorker: pixelWorkerRef.current,
          callbacks: {
            onWandSelection: (sel) => {
              setSelection(sel);
              selectionRef.current = sel;
              drawSelectionOverlay(sel);
            },
            onComplete: () => bumpRevision(),
          },
        });
        return;
      }

      if (isShapeTool(tool)) return;

      const last = lastPixelRef.current;
      void paintAtTexturePixel(
        paintCtx(),
        tx,
        ty,
        isStroke,
        last ? { x: last[0], y: last[1] } : null,
        {
          pixelWorker: pixelWorkerRef.current,
          callbacks: { onComplete: () => bumpRevision() },
        },
      ).then((next) => {
        if (next) lastPixelRef.current = [next.x, next.y];
      });
    },
    [
      handle,
      selectedFace.texturePath,
      tool,
      setColor,
      pushRecentColor,
      bumpRevision,
      paintCtx,
      setSelection,
      drawSelectionOverlay,
      pixelWorkerRef,
    ],
  );

  const commitShape = useCallback(
    (end: [number, number]) => {
      const start = shapeStartRef.current;
      if (!start) return;
      commitShapeAt(
        handle,
        paintCtx(),
        { x: start[0], y: start[1] },
        { x: end[0], y: end[1] },
      );
      shapeStartRef.current = null;
      clearOverlay();
      bumpRevision();
    },
    [handle, paintCtx, clearOverlay, bumpRevision],
  );

  const pointerToTexture = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>): [number, number] | null => {
      const view = canvasRef.current;
      const source = getTextureCanvas(selectedFace.texturePath);
      if (!view || !source) return null;

      const rect = view.getBoundingClientRect();
      const localX = ((event.clientX - rect.left) / rect.width) * view.width;
      const localY = ((event.clientY - rect.top) / rect.height) * view.height;

      if (useAtlasView) {
        const tx = Math.floor((localX / view.width) * source.width);
        const ty = Math.floor((localY / view.height) * source.height);
        const faceRegion = faceUvRegion(faceForRegion(), source.width, source.height);
        if (!pointInRegion(tx, ty, faceRegion)) return null;
        return [tx, ty];
      }

      const region = faceUvRegion(faceForRegion(), source.width, source.height);
      return canvasToTexture(localX, localY, region, view.width, view.height);
    },
    [selectedFace.texturePath, faceForRegion, useAtlasView],
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
        const layerCtx = getActiveLayerContext(path);
        const doc = getDoc(path);
        const activeLayer = layerCtx
          ? doc?.layers.find((layer) => layer.id === layerCtx.layerId)
          : null;
        if (activeLayer) {
          const ctx = activeLayer.ctx;
          const [sx0, sy0, sx1, sy1] = [
            Math.min(selection[0], selection[2]),
            Math.min(selection[1], selection[3]),
            Math.max(selection[0], selection[2]),
            Math.max(selection[1], selection[3]),
          ];
          const w = sx1 - sx0 + 1;
          const h = sy1 - sy0 + 1;
          const data = ctx.getImageData(sx0, sy0, w, h);
          const pixels = new Map<string, Rgba>();
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const i = (y * w + x) * 4;
              const [r, g, b, a] = [
                data.data[i],
                data.data[i + 1],
                data.data[i + 2],
                data.data[i + 3],
              ];
              pixels.set(`${x},${y}`, [r, g, b, a]);
            }
          }
          moveBufferRef.current = { pixels, x0: sx0, y0: sy0, w, h };
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

    if (
      tool !== "fill" &&
      tool !== "wand" &&
      tool !== "picker"
    ) {
      beginBrushStroke(selectedFace.texturePath);
    }

    applyAt(point[0], point[1], false);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    let point = pointerToTexture(event);
    if (point && stabilizer > 0) {
      stabilizerRef.current.push(point);
      if (stabilizerRef.current.length > stabilizer) stabilizerRef.current.shift();
      const pts = stabilizerRef.current;
      const avgX = Math.round(pts.reduce((s, p) => s + p[0], 0) / pts.length);
      const avgY = Math.round(pts.reduce((s, p) => s + p[1], 0) / pts.length);
      point = [avgX, avgY];
    }
    setHoverPixel(point);
    setCursor(point ? point[0] : null, point ? point[1] : null);
    scheduleBrushCursor(point);

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
        const layerContext = getActiveLayerContext(path);
        const doc = getDoc(path);
        if (layerContext && doc) {
          const changes = buildMoveSelectionChanges(
            layerContext.layerId,
            mb,
            dx,
            dy,
            (x, y) => getLayerPixel(path, layerContext.layerId, x, y),
            { width: doc.width, height: doc.height },
          );
          if (changes.length > 0) {
            commitChanges(handle, path, changes, true, "edit", true);
            bumpRevision();
          }
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
    } else if (
      tool !== "fill" &&
      tool !== "wand" &&
      tool !== "picker" &&
      !isSelectionTool(tool)
    ) {
      endBrushStroke(handle, selectedFace.texturePath, `${TOOL_LABELS[tool]} stroke`, true);
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    if (handle) flushIconInvalidations(handle);
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
            scheduleBrushCursor(null);
          }}
        />
        <canvas ref={cursorRef} className={styles.cursorLayer} aria-hidden />
      </div>
      <div className={styles.historyRow}>
        <span className={styles.historyHint}>
          {peekUndoLabel(selectedFace.texturePath)
            ? `Undo: ${peekUndoLabel(selectedFace.texturePath)}`
            : "Undo Ctrl+Z"}
          {peekRedoLabel(selectedFace.texturePath)
            ? ` · Redo: ${peekRedoLabel(selectedFace.texturePath)}`
            : ""}
        </span>
        <span className={styles.historyState}>
          {canUndo(selectedFace.texturePath) ? "edited" : "clean"}
          {canRedo(selectedFace.texturePath) ? " · redo available" : ""}
        </span>
      </div>
    </div>
  );
}
