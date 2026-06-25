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

export interface UndoEntry {
  changes: PixelChange[];
  label: string;
}

export const MAX_UNDO_ENTRIES = 64;
export const MAX_UNDO_PIXEL_CHANGES = 500_000;

function clonePixelChange(change: PixelChange): PixelChange {
  return {
    x: change.x,
    y: change.y,
    before: [change.before[0], change.before[1], change.before[2], change.before[3]],
    after: [change.after[0], change.after[1], change.after[2], change.after[3]],
    layerId: change.layerId,
  };
}

function clonePixelChanges(changes: PixelChange[]): PixelChange[] {
  return changes.map(clonePixelChange);
}

function trimUndoStack(doc: TextureDoc): void {
  while (doc.undo.length > MAX_UNDO_ENTRIES) {
    doc.undo.shift();
  }
  let total = doc.undo.reduce((sum, entry) => sum + entry.changes.length, 0);
  while (total > MAX_UNDO_PIXEL_CHANGES && doc.undo.length > 0) {
    const removed = doc.undo.shift();
    if (removed) total -= removed.changes.length;
  }
}

export interface TextureLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blendMode: BlendMode;
}

export interface LayerBuffers extends TextureLayer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pixelCache: Uint8ClampedArray | null;
  cacheWidth: number;
  cacheHeight: number;
  cacheDirty: boolean;
}

export interface TextureDoc {
  width: number;
  height: number;
  layers: LayerBuffers[];
  activeLayerId: string;
  compositeCanvas: HTMLCanvasElement;
  compositeCtx: CanvasRenderingContext2D;
  originalCanvas: HTMLCanvasElement;
  undo: UndoEntry[];
  redo: UndoEntry[];
  dirty: boolean;
  dirtyBox: { x0: number; y0: number; x1: number; y1: number } | null;
  revision: number;
  savedRevision: number;
}

export interface PixelBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function mergePixelBounds(
  bounds: PixelBounds | null,
  x: number,
  y: number,
): PixelBounds {
  if (!bounds) return { x0: x, y0: y, x1: x, y1: y };
  return {
    x0: Math.min(bounds.x0, x),
    y0: Math.min(bounds.y0, y),
    x1: Math.max(bounds.x1, x),
    y1: Math.max(bounds.y1, y),
  };
}

export function boundsFromChanges(changes: PixelChange[]): PixelBounds | null {
  if (changes.length === 0) return null;
  let bounds: PixelBounds | null = null;
  for (const change of changes) {
    bounds = mergePixelBounds(bounds, change.x, change.y);
  }
  return bounds;
}

/** Expand the document dirty region to include pixel coordinates from changes. */
export function mergeDirtyBoxFromChanges(
  doc: TextureDoc,
  changes: Pick<PixelChange, "x" | "y">[],
): void {
  const bounds = boundsFromChanges(changes as PixelChange[]);
  if (!bounds) return;
  if (!doc.dirtyBox) {
    doc.dirtyBox = { ...bounds };
    return;
  }
  doc.dirtyBox = {
    x0: Math.min(doc.dirtyBox.x0, bounds.x0),
    y0: Math.min(doc.dirtyBox.y0, bounds.y0),
    x1: Math.max(doc.dirtyBox.x1, bounds.x1),
    y1: Math.max(doc.dirtyBox.y1, bounds.y1),
  };
}

/** Materialize a full layer cache for bulk algorithms (fill, worker IPC). */
export function ensureLayerPixelCache(layer: LayerBuffers): Uint8ClampedArray {
  const { width, height } = layer.canvas;
  if (
    layer.pixelCache &&
    layer.cacheWidth === width &&
    layer.cacheHeight === height &&
    !layer.cacheDirty
  ) {
    return layer.pixelCache;
  }
  if (
    layer.pixelCache &&
    layer.cacheWidth === width &&
    layer.cacheHeight === height &&
    layer.cacheDirty
  ) {
    return layer.pixelCache;
  }
  layer.pixelCache = new Uint8ClampedArray(
    layer.ctx.getImageData(0, 0, width, height).data,
  );
  layer.cacheWidth = width;
  layer.cacheHeight = height;
  layer.cacheDirty = false;
  return layer.pixelCache;
}

export function flushLayerPixelCache(layer: LayerBuffers): void {
  if (!layer.pixelCache || !layer.cacheDirty) return;
  const imageData = layer.ctx.createImageData(layer.cacheWidth, layer.cacheHeight);
  imageData.data.set(layer.pixelCache);
  layer.ctx.putImageData(imageData, 0, 0);
  layer.cacheDirty = false;
}

export function invalidateLayerPixelCache(layer: LayerBuffers): void {
  layer.pixelCache = null;
  layer.cacheWidth = 0;
  layer.cacheHeight = 0;
  layer.cacheDirty = false;
}

export function readLayerRgba(layer: LayerBuffers, x: number, y: number): Rgba | null {
  if (x < 0 || y < 0 || x >= layer.canvas.width || y >= layer.canvas.height) return null;
  if (
    layer.pixelCache &&
    layer.cacheWidth === layer.canvas.width &&
    layer.cacheHeight === layer.canvas.height
  ) {
    const i = (y * layer.cacheWidth + x) * 4;
    return [layer.pixelCache[i], layer.pixelCache[i + 1], layer.pixelCache[i + 2], layer.pixelCache[i + 3]];
  }
  const data = layer.ctx.getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}

export function writeLayerRgba(
  layer: LayerBuffers,
  x: number,
  y: number,
  rgba: Rgba,
): boolean {
  if (x < 0 || y < 0 || x >= layer.canvas.width || y >= layer.canvas.height) return false;
  if (
    layer.pixelCache &&
    layer.cacheWidth === layer.canvas.width &&
    layer.cacheHeight === layer.canvas.height
  ) {
    const i = (y * layer.cacheWidth + x) * 4;
    layer.pixelCache[i] = rgba[0];
    layer.pixelCache[i + 1] = rgba[1];
    layer.pixelCache[i + 2] = rgba[2];
    layer.pixelCache[i + 3] = rgba[3];
    layer.cacheDirty = true;
    return true;
  }
  const cell = layer.ctx.createImageData(1, 1);
  cell.data[0] = rgba[0];
  cell.data[1] = rgba[1];
  cell.data[2] = rgba[2];
  cell.data[3] = rgba[3];
  layer.ctx.putImageData(cell, x, y);
  return true;
}

export function readCompositeRgba(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): Rgba | null {
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}

export function writeRgba(
  layer: LayerBuffers,
  x: number,
  y: number,
  rgba: Rgba,
): boolean {
  return writeLayerRgba(layer, x, y, rgba);
}

/** @deprecated Use readCompositeRgba — kept for internal callers. */
export function readRgba(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): Rgba | null {
  return readCompositeRgba(ctx, x, y, width, height);
}

const PARTIAL_COMPOSITE_MAX_PIXELS = 256 * 256;

export function compositeDocument(doc: TextureDoc, region?: PixelBounds | null): void {
  for (const layer of doc.layers) {
    flushLayerPixelCache(layer);
  }
  const { compositeCtx, width, height, layers } = doc;
  const useRegion =
    region &&
    (region.x1 - region.x0 + 1) * (region.y1 - region.y0 + 1) <=
      PARTIAL_COMPOSITE_MAX_PIXELS;

  if (!useRegion || !region) {
    compositeCtx.clearRect(0, 0, width, height);
    for (const layer of layers) {
      if (!layer.visible) continue;
      compositeCtx.globalAlpha = layer.opacity;
      compositeCtx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
      compositeCtx.drawImage(layer.canvas, 0, 0);
    }
    compositeCtx.globalAlpha = 1;
    compositeCtx.globalCompositeOperation = "source-over";
    return;
  }

  const x0 = Math.max(0, region.x0);
  const y0 = Math.max(0, region.y0);
  const x1 = Math.min(width - 1, region.x1);
  const y1 = Math.min(height - 1, region.y1);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (w <= 0 || h <= 0) return;

  compositeCtx.save();
  compositeCtx.beginPath();
  compositeCtx.rect(x0, y0, w, h);
  compositeCtx.clip();
  compositeCtx.clearRect(x0, y0, w, h);
  for (const layer of layers) {
    if (!layer.visible) continue;
    compositeCtx.globalAlpha = layer.opacity;
    compositeCtx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
    compositeCtx.drawImage(layer.canvas, 0, 0);
  }
  compositeCtx.restore();
  compositeCtx.globalAlpha = 1;
  compositeCtx.globalCompositeOperation = "source-over";
}

export function getLayer(doc: TextureDoc, layerId: string): LayerBuffers | null {
  return doc.layers.find((layer) => layer.id === layerId) ?? null;
}

export function activeLayer(doc: TextureDoc): LayerBuffers {
  return getLayer(doc, doc.activeLayerId) ?? doc.layers[0];
}

export function inBounds(doc: TextureDoc, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < doc.width && y < doc.height;
}

export function applyChangesToDoc(
  doc: TextureDoc,
  changes: PixelChange[],
  recordUndo: boolean,
  label = "edit",
): void {
  if (changes.length === 0) return;

  if (recordUndo) {
    doc.undo.push({ changes: clonePixelChanges(changes), label });
    trimUndoStack(doc);
    doc.redo = [];
  }

  for (const change of changes) {
    if (!inBounds(doc, change.x, change.y)) continue;
    const layer = getLayer(doc, change.layerId);
    if (!layer || layer.locked) continue;
    writeLayerRgba(layer, change.x, change.y, change.after);
    if (!doc.dirtyBox) {
      doc.dirtyBox = { x0: change.x, y0: change.y, x1: change.x, y1: change.y };
    } else {
      doc.dirtyBox.x0 = Math.min(doc.dirtyBox.x0, change.x);
      doc.dirtyBox.y0 = Math.min(doc.dirtyBox.y0, change.y);
      doc.dirtyBox.x1 = Math.max(doc.dirtyBox.x1, change.x);
      doc.dirtyBox.y1 = Math.max(doc.dirtyBox.y1, change.y);
    }
  }

  compositeDocument(doc, boundsFromChanges(changes));
  doc.revision += 1;
  doc.dirty = true;
}

export function canvasToPngBase64(canvas: HTMLCanvasElement): Promise<string> {
  if (typeof canvas.toBlob !== "function") {
    const dataUrl = canvas.toDataURL("image/png");
    const comma = dataUrl.indexOf(",");
    return Promise.resolve(comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl);
  }

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
