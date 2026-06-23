import type { ProjectHandle } from "../../ipc/types";
import { ipc } from "../../ipc/client";
import { refreshTextureFromCanvas } from "../viewer3d/textureLoader";

export type Rgba = [number, number, number, number];

export type BlendMode =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion";

export interface PixelChange {
  x: number;
  y: number;
  before: Rgba;
  after: Rgba;
  layerId: string;
}

export interface TextureLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blendMode: BlendMode;
}

/** Clipboard buffer for region copy/paste */
interface ClipboardRegion {
  width: number;
  height: number;
  data: ImageData;
}

interface LayerBuffers extends TextureLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

let clipboard: ClipboardRegion | null = null;

interface TextureDoc {
  width: number;
  height: number;
  layers: LayerBuffers[];
  activeLayerId: string;
  compositeCanvas: HTMLCanvasElement;
  compositeCtx: CanvasRenderingContext2D;
  originalCanvas: HTMLCanvasElement;
  undo: PixelChange[][];
  redo: PixelChange[][];
  dirty: boolean;
  /** Bounding box of accumulated dirty pixels (texture coords, inclusive) */
  dirtyBox: { x0: number; y0: number; x1: number; y1: number } | null;
}

const docs = new Map<string, TextureDoc>();
const listeners = new Set<() => void>();
let layerIdCounter = 1;

function notify(): void {
  for (const fn of listeners) fn();
}

function nextLayerId(): string {
  layerIdCounter += 1;
  return `layer-${layerIdCounter}`;
}

function readRgba(ctx: CanvasRenderingContext2D, x: number, y: number): Rgba {
  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}

function writeRgba(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rgba: Rgba,
): void {
  const image = ctx.createImageData(1, 1);
  image.data[0] = rgba[0];
  image.data[1] = rgba[1];
  image.data[2] = rgba[2];
  image.data[3] = rgba[3];
  ctx.putImageData(image, x, y);
}

function loadImage(preview: { pngBase64: string }): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("failed to decode texture image"));
    img.src = `data:image/png;base64,${preview.pngBase64}`;
  });
}

function createLayerBuffer(width: number, height: number, name: string): LayerBuffers {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  return {
    id: nextLayerId(),
    name,
    visible: true,
    opacity: 1,
    locked: false,
    blendMode: "normal",
    canvas,
    ctx,
  };
}

export function compositeDocument(doc: TextureDoc): void {
  const { compositeCtx, width, height, layers } = doc;
  compositeCtx.clearRect(0, 0, width, height);
  for (const layer of layers) {
    if (!layer.visible) continue;
    compositeCtx.globalAlpha = layer.opacity;
    compositeCtx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
    compositeCtx.drawImage(layer.canvas, 0, 0);
  }
  compositeCtx.globalAlpha = 1;
  compositeCtx.globalCompositeOperation = "source-over";
}

function getLayer(doc: TextureDoc, layerId: string): LayerBuffers | null {
  return doc.layers.find((layer) => layer.id === layerId) ?? null;
}

function activeLayer(doc: TextureDoc): LayerBuffers {
  return getLayer(doc, doc.activeLayerId) ?? doc.layers[0];
}

function inBounds(doc: TextureDoc, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < doc.width && y < doc.height;
}

export function subscribeTextureDocuments(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearTextureDocuments(): void {
  docs.clear();
  notify();
}

export function isTextureDirty(path: string): boolean {
  return docs.get(path)?.dirty ?? false;
}

export function getDirtyTexturePaths(): string[] {
  return [...docs.entries()].filter(([, doc]) => doc.dirty).map(([path]) => path);
}

export function getTextureCanvas(path: string): HTMLCanvasElement | null {
  return docs.get(path)?.compositeCanvas ?? null;
}

export function getOriginalTextureCanvas(path: string): HTMLCanvasElement | null {
  return docs.get(path)?.originalCanvas ?? null;
}

export function listTextureLayers(path: string): TextureLayer[] {
  const doc = docs.get(path);
  if (!doc) return [];
  return doc.layers.map(({ id, name, visible, opacity, locked, blendMode }) => ({
    id,
    name,
    visible,
    opacity,
    locked,
    blendMode,
  }));
}

export function getActiveLayerId(path: string): string | null {
  return docs.get(path)?.activeLayerId ?? null;
}

export function setActiveLayer(path: string, layerId: string): void {
  const doc = docs.get(path);
  if (!doc || !getLayer(doc, layerId)) return;
  doc.activeLayerId = layerId;
  notify();
}

export function addTextureLayer(path: string): TextureLayer | null {
  const doc = docs.get(path);
  if (!doc) return null;
  const layer = createLayerBuffer(
    doc.width,
    doc.height,
    `Layer ${doc.layers.length + 1}`,
  );
  doc.layers.push(layer);
  doc.activeLayerId = layer.id;
  compositeDocument(doc);
  notify();
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    locked: layer.locked,
    blendMode: layer.blendMode,
  };
}

export function removeTextureLayer(path: string, layerId: string): boolean {
  const doc = docs.get(path);
  if (!doc || doc.layers.length <= 1) return false;
  const index = doc.layers.findIndex((layer) => layer.id === layerId);
  if (index < 0) return false;
  doc.layers.splice(index, 1);
  if (doc.activeLayerId === layerId) {
    doc.activeLayerId = doc.layers[Math.max(0, index - 1)].id;
  }
  compositeDocument(doc);
  doc.dirty = true;
  notify();
  return true;
}

export function updateTextureLayer(
  path: string,
  layerId: string,
  patch: Partial<
    Pick<TextureLayer, "name" | "visible" | "opacity" | "locked" | "blendMode">
  >,
): void {
  const doc = docs.get(path);
  const layer = doc ? getLayer(doc, layerId) : null;
  if (!doc || !layer) return;
  if (patch.name !== undefined) layer.name = patch.name;
  if (patch.visible !== undefined) layer.visible = patch.visible;
  if (patch.opacity !== undefined) layer.opacity = patch.opacity;
  if (patch.locked !== undefined) layer.locked = patch.locked;
  if (patch.blendMode !== undefined) layer.blendMode = patch.blendMode;
  compositeDocument(doc);
  notify();
}

/** Reorder layers: move layerId to targetIndex position (0 = bottom). */
export function reorderTextureLayer(
  path: string,
  layerId: string,
  targetIndex: number,
): void {
  const doc = docs.get(path);
  if (!doc) return;
  const fromIndex = doc.layers.findIndex((l) => l.id === layerId);
  if (fromIndex < 0) return;
  const [layer] = doc.layers.splice(fromIndex, 1);
  const clampedTarget = Math.max(0, Math.min(doc.layers.length, targetIndex));
  doc.layers.splice(clampedTarget, 0, layer);
  compositeDocument(doc);
  doc.dirty = true;
  notify();
}

/** Copy a rectangular region of the composite to clipboard. */
export function copyRegion(
  path: string,
  x: number,
  y: number,
  width: number,
  height: number,
): boolean {
  const doc = docs.get(path);
  if (!doc) return false;
  const data = doc.compositeCtx.getImageData(x, y, width, height);
  clipboard = { width, height, data };
  return true;
}

/** Paste clipboard content at (x, y) on the active layer. */
export function pasteRegion(path: string, x: number, y: number): PixelChange[] {
  const doc = docs.get(path);
  if (!doc || !clipboard) return [];
  const layer = activeLayer(doc);
  if (layer.locked) return [];

  const changes: PixelChange[] = [];
  for (let dy = 0; dy < clipboard.height; dy += 1) {
    for (let dx = 0; dx < clipboard.width; dx += 1) {
      const px = x + dx;
      const py = y + dy;
      if (!inBounds(doc, px, py)) continue;
      const si = (dy * clipboard.width + dx) * 4;
      const after: Rgba = [
        clipboard.data.data[si],
        clipboard.data.data[si + 1],
        clipboard.data.data[si + 2],
        clipboard.data.data[si + 3],
      ];
      const before = readRgba(layer.ctx, px, py);
      changes.push({ x: px, y: py, before, after, layerId: layer.id });
    }
  }
  return changes;
}

export function hasClipboard(): boolean {
  return clipboard !== null;
}

async function loadImageForEditor(
  handle: ProjectHandle,
  path: string,
): Promise<{ image: HTMLImageElement; width: number; height: number }> {
  try {
    const bytes = await ipc.getTextureBinary(handle, path);
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`failed: ${path}`));
      };
      img.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    const preview = await ipc.getTexture(handle, path);
    const image = await loadImage(preview);
    return { image, width: preview.width, height: preview.height };
  }
}

export async function ensureTextureDocument(
  handle: ProjectHandle,
  path: string,
): Promise<TextureDoc> {
  const existing = docs.get(path);
  if (existing) return existing;

  const { image, width, height } = await loadImageForEditor(handle, path);

  const compositeCanvas = document.createElement("canvas");
  compositeCanvas.width = width;
  compositeCanvas.height = height;
  const compositeCtx = compositeCanvas.getContext("2d", { willReadFrequently: true });
  if (!compositeCtx) throw new Error("2d context unavailable");

  const originalCanvas = document.createElement("canvas");
  originalCanvas.width = width;
  originalCanvas.height = height;
  const originalCtx = originalCanvas.getContext("2d", { willReadFrequently: true });
  if (!originalCtx) throw new Error("2d context unavailable");

  const baseLayer = createLayerBuffer(width, height, "Layer 1");
  baseLayer.ctx.drawImage(image, 0, 0);
  originalCtx.drawImage(image, 0, 0);

  const doc: TextureDoc = {
    width,
    height,
    layers: [baseLayer],
    activeLayerId: baseLayer.id,
    compositeCanvas,
    compositeCtx,
    originalCanvas,
    undo: [],
    redo: [],
    dirty: false,
    dirtyBox: null,
  };
  compositeDocument(doc);
  docs.set(path, doc);
  notify();
  return doc;
}

export function getPixel(path: string, x: number, y: number): Rgba | null {
  const doc = docs.get(path);
  if (!doc || !inBounds(doc, x, y)) return null;
  return readRgba(doc.compositeCtx, x, y);
}

export function getLayerPixel(
  path: string,
  layerId: string,
  x: number,
  y: number,
): Rgba | null {
  const doc = docs.get(path);
  const layer = doc ? getLayer(doc, layerId) : null;
  if (!doc || !layer || !inBounds(doc, x, y)) return null;
  return readRgba(layer.ctx, x, y);
}

function applyChanges(
  doc: TextureDoc,
  changes: PixelChange[],
  recordUndo: boolean,
): void {
  if (changes.length === 0) return;

  if (recordUndo) {
    doc.undo.push(changes);
    doc.redo = [];
  }

  for (const change of changes) {
    if (!inBounds(doc, change.x, change.y)) continue;
    const layer = getLayer(doc, change.layerId);
    if (!layer || layer.locked) continue;
    writeRgba(layer.ctx, change.x, change.y, change.after);
    // Expand dirty bounding box
    if (!doc.dirtyBox) {
      doc.dirtyBox = { x0: change.x, y0: change.y, x1: change.x, y1: change.y };
    } else {
      doc.dirtyBox.x0 = Math.min(doc.dirtyBox.x0, change.x);
      doc.dirtyBox.y0 = Math.min(doc.dirtyBox.y0, change.y);
      doc.dirtyBox.x1 = Math.max(doc.dirtyBox.x1, change.x);
      doc.dirtyBox.y1 = Math.max(doc.dirtyBox.y1, change.y);
    }
  }

  compositeDocument(doc);
  doc.dirty = true;
}

export function commitChanges(
  handle: ProjectHandle | null,
  path: string,
  changes: PixelChange[],
  recordUndo = true,
): void {
  const doc = docs.get(path);
  if (!doc) return;

  applyChanges(doc, changes, recordUndo);
  if (handle) refreshTextureFromCanvas(handle, path, doc.compositeCanvas);
  notify();
}

export function undoTexture(handle: ProjectHandle | null, path: string): boolean {
  const doc = docs.get(path);
  if (!doc || doc.undo.length === 0) return false;

  const entry = doc.undo.pop()!;
  const inverse: PixelChange[] = entry.map((change) => ({
    x: change.x,
    y: change.y,
    before: change.after,
    after: change.before,
    layerId: change.layerId,
  }));

  for (const change of inverse) {
    const layer = getLayer(doc, change.layerId);
    if (!layer) continue;
    writeRgba(layer.ctx, change.x, change.y, change.after);
  }

  compositeDocument(doc);
  doc.redo.push(entry);
  doc.dirty = doc.undo.length > 0 || doc.redo.length > 0;
  if (handle) refreshTextureFromCanvas(handle, path, doc.compositeCanvas);
  notify();
  return true;
}

export function redoTexture(handle: ProjectHandle | null, path: string): boolean {
  const doc = docs.get(path);
  if (!doc || doc.redo.length === 0) return false;

  const entry = doc.redo.pop()!;
  applyChanges(doc, entry, false);
  doc.undo.push(entry);
  doc.dirty = true;
  if (handle) refreshTextureFromCanvas(handle, path, doc.compositeCanvas);
  notify();
  return true;
}

export function canUndo(path: string): boolean {
  return (docs.get(path)?.undo.length ?? 0) > 0;
}

export function canRedo(path: string): boolean {
  return (docs.get(path)?.redo.length ?? 0) > 0;
}

export function getActiveLayerContext(path: string): {
  layerId: string;
  width: number;
  height: number;
  locked: boolean;
} | null {
  const doc = docs.get(path);
  if (!doc) return null;
  const layer = activeLayer(doc);
  return {
    layerId: layer.id,
    width: doc.width,
    height: doc.height,
    locked: layer.locked,
  };
}

export function canvasToPngBase64(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("failed to encode canvas to png"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string") {
          reject(new Error("failed to read png blob"));
          return;
        }
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(new Error("failed to read png blob"));
      reader.readAsDataURL(blob);
    }, "image/png");
  });
}

export function markTexturesSaved(savedPaths: string[], originalPaths?: string[]): void {
  if (originalPaths && originalPaths.length === savedPaths.length) {
    for (let i = 0; i < savedPaths.length; i++) {
      const original = originalPaths[i];
      const saved = savedPaths[i];
      if (original !== saved && docs.has(original)) {
        const doc = docs.get(original)!;
        docs.delete(original);
        doc.dirty = false;
        doc.dirtyBox = null;
        docs.set(saved, doc);
      } else {
        const doc = docs.get(saved);
        if (doc) {
          doc.dirty = false;
          doc.dirtyBox = null;
        }
      }
    }
  } else {
    for (const path of savedPaths) {
      const doc = docs.get(path);
      if (doc) {
        doc.dirty = false;
        doc.dirtyBox = null;
      }
    }
  }

  for (const path of savedPaths) {
    const doc = docs.get(path);
    if (!doc) continue;
    const originalCtx = doc.originalCanvas.getContext("2d");
    if (!originalCtx) continue;
    originalCtx.clearRect(0, 0, doc.width, doc.height);
    originalCtx.drawImage(doc.compositeCanvas, 0, 0);
  }

  notify();
}

export async function collectDirtyTextureEntries(): Promise<
  { path: string; pngBase64: string; targetPath?: string }[]
> {
  const entries: { path: string; pngBase64: string }[] = [];
  for (const path of getDirtyTexturePaths()) {
    const canvas = getTextureCanvas(path);
    if (!canvas) continue;
    entries.push({
      path,
      pngBase64: await canvasToPngBase64(canvas),
    });
  }
  return entries;
}

/**
 * Returns only the dirty bounding box region as a PNG crop.
 * The result includes `x`, `y`, `w`, `h` so the backend can composite it
 * over the original rather than writing the entire file.
 * Falls back to full PNG when there is no dirty-box info.
 */
export async function collectDeltaTextureEntries(): Promise<
  { path: string; pngBase64: string; x: number; y: number; w: number; h: number }[]
> {
  const entries: {
    path: string;
    pngBase64: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }[] = [];
  for (const path of getDirtyTexturePaths()) {
    const doc = docs.get(path);
    const canvas = doc?.compositeCanvas;
    if (!canvas || !doc) continue;

    if (!doc.dirtyBox) {
      entries.push({
        path,
        pngBase64: await canvasToPngBase64(canvas),
        x: 0,
        y: 0,
        w: canvas.width,
        h: canvas.height,
      });
      continue;
    }

    const { x0, y0, x1, y1 } = doc.dirtyBox;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const crop = document.createElement("canvas");
    crop.width = w;
    crop.height = h;
    const ctx = crop.getContext("2d")!;
    ctx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);
    entries.push({ path, pngBase64: await canvasToPngBase64(crop), x: x0, y: y0, w, h });
  }
  return entries;
}
