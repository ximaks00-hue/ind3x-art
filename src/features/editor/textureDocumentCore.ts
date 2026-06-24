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

export function ensureLayerPixelCache(layer: LayerBuffers): Uint8ClampedArray {
  const { width, height } = layer.canvas;
  if (
    layer.pixelCache &&
    layer.cacheWidth === width &&
    layer.cacheHeight === height
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

export function readLayerRgba(layer: LayerBuffers, x: number, y: number): Rgba {
  const data = ensureLayerPixelCache(layer);
  const i = (y * layer.cacheWidth + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

export function writeLayerRgba(
  layer: LayerBuffers,
  x: number,
  y: number,
  rgba: Rgba,
): void {
  const data = ensureLayerPixelCache(layer);
  const i = (y * layer.cacheWidth + x) * 4;
  data[i] = rgba[0];
  data[i + 1] = rgba[1];
  data[i + 2] = rgba[2];
  data[i + 3] = rgba[3];
  layer.cacheDirty = true;
}

export function readRgba(ctx: CanvasRenderingContext2D, x: number, y: number): Rgba {
  const data = ctx.getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}

export function writeRgba(
  layer: LayerBuffers,
  x: number,
  y: number,
  rgba: Rgba,
): void {
  writeLayerRgba(layer, x, y, rgba);
}

export function compositeDocument(doc: TextureDoc): void {
  for (const layer of doc.layers) {
    flushLayerPixelCache(layer);
  }
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
    doc.undo.push({ changes, label });
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

  compositeDocument(doc);
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
