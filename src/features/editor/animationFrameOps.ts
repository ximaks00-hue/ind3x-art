import type { ProjectHandle, TextureAnimationMeta } from "../../ipc/types";
import type { LayerBuffers, TextureDoc } from "./textureDocumentCore";
import {
  compositeDocument,
  invalidateLayerPixelCache,
} from "./textureDocumentCore";
import {
  commitChanges,
  getDoc,
  markDirty,
} from "./documentStore";

export function frameStripHeight(
  meta: TextureAnimationMeta,
  canvasHeight: number,
): number {
  return meta.frameHeight || Math.max(1, Math.floor(canvasHeight / meta.frames.length));
}

export function metaAfterDuplicate(
  meta: TextureAnimationMeta,
  frameIndex: number,
): TextureAnimationMeta {
  const row = meta.frames[frameIndex] ?? frameIndex;
  const frames = meta.frames.map((entry) => (entry > row ? entry + 1 : entry));
  frames.splice(frameIndex + 1, 0, row + 1);
  return { ...meta, frames };
}

export function metaAfterDelete(
  meta: TextureAnimationMeta,
  frameIndex: number,
): TextureAnimationMeta {
  const row = meta.frames[frameIndex] ?? frameIndex;
  const frames = meta.frames
    .filter((_, idx) => idx !== frameIndex)
    .map((entry) => (entry > row ? entry - 1 : entry));
  return { ...meta, frames };
}

function resizeCanvasStrip(
  src: HTMLCanvasElement,
  width: number,
  oldHeight: number,
  stripY: number,
  stripH: number,
  mode: "insert" | "delete",
): HTMLCanvasElement {
  const newHeight = mode === "insert" ? oldHeight + stripH : oldHeight - stripH;
  const dest = document.createElement("canvas");
  dest.width = width;
  dest.height = newHeight;
  const ctx = dest.getContext("2d");
  if (!ctx) return src;

  if (mode === "insert") {
    ctx.drawImage(src, 0, 0, width, stripY + stripH, 0, 0, width, stripY + stripH);
    ctx.drawImage(src, 0, stripY, width, stripH, 0, stripY + stripH, width, stripH);
    ctx.drawImage(
      src,
      0,
      stripY + stripH,
      width,
      oldHeight - stripY - stripH,
      0,
      stripY + 2 * stripH,
      width,
      oldHeight - stripY - stripH,
    );
  } else {
    ctx.drawImage(src, 0, 0, width, stripY, 0, 0, width, stripY);
    ctx.drawImage(
      src,
      0,
      stripY + stripH,
      width,
      oldHeight - stripY - stripH,
      0,
      stripY,
      width,
      oldHeight - stripY - stripH,
    );
  }
  return dest;
}

function applyStripResizeToLayer(
  layer: LayerBuffers,
  width: number,
  oldHeight: number,
  stripY: number,
  stripH: number,
  mode: "insert" | "delete",
): void {
  const resized = resizeCanvasStrip(layer.canvas, width, oldHeight, stripY, stripH, mode);
  layer.canvas = resized;
  layer.ctx = resized.getContext("2d", { willReadFrequently: true })!;
  invalidateLayerPixelCache(layer);
}

function applyStripResize(doc: TextureDoc, stripY: number, stripH: number, mode: "insert" | "delete"): void {
  const oldHeight = doc.height;
  for (const layer of doc.layers) {
    applyStripResizeToLayer(layer, doc.width, oldHeight, stripY, stripH, mode);
  }
  const resized = resizeCanvasStrip(
    doc.compositeCanvas,
    doc.width,
    oldHeight,
    stripY,
    stripH,
    mode,
  );
  doc.compositeCanvas = resized;
  doc.compositeCtx = resized.getContext("2d", { willReadFrequently: true })!;
  doc.originalCanvas = resizeCanvasStrip(
    doc.originalCanvas,
    doc.width,
    oldHeight,
    stripY,
    stripH,
    mode,
  );
  doc.height = mode === "insert" ? oldHeight + stripH : oldHeight - stripH;
  compositeDocument(doc);
}

export function duplicateAnimationFramePixels(
  handle: ProjectHandle | null,
  path: string,
  frameIndex: number,
  meta: TextureAnimationMeta,
): boolean {
  const doc = getDoc(path);
  if (!doc) return false;
  const stripH = frameStripHeight(meta, doc.height);
  const row = meta.frames[frameIndex] ?? frameIndex;
  const stripY = row * stripH;
  if (stripY + stripH > doc.height || stripH <= 0) return false;

  applyStripResize(doc, stripY, stripH, "insert");
  markDirty(path);
  commitChanges(handle, path, [], false, "Duplicate animation frame");
  return true;
}

export function deleteAnimationFramePixels(
  handle: ProjectHandle | null,
  path: string,
  frameIndex: number,
  meta: TextureAnimationMeta,
): boolean {
  const doc = getDoc(path);
  if (!doc || meta.frames.length <= 1) return false;
  const stripH = frameStripHeight(meta, doc.height);
  const row = meta.frames[frameIndex] ?? frameIndex;
  const stripY = row * stripH;
  if (stripY + stripH > doc.height || stripH <= 0) return false;

  applyStripResize(doc, stripY, stripH, "delete");
  markDirty(path);
  commitChanges(handle, path, [], false, "Delete animation frame");
  return true;
}
