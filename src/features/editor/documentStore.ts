import { create } from "zustand";

import type { ProjectHandle } from "../../ipc/types";
import { ipc } from "../../ipc/client";
import { mapWithConcurrency } from "../../lib/mapWithConcurrency";
import { invalidateCatalogIconsForTextures } from "../catalog/catalogIconInvalidation";
import { refreshTextureFromCanvas } from "../viewer3d/textureLoader";
import {
  activeLayer,
  applyChangesToDoc,
  canvasToPngBase64,
  compositeDocument,
  getLayer,
  inBounds,
  readRgba,
  readLayerRgba,
  writeLayerRgba,
  invalidateLayerPixelCache,
  type LayerBuffers,
  type PixelChange,
  type Rgba,
  type TextureDoc,
  type TextureLayer,
} from "./textureDocumentCore";

export type { BlendMode, PixelChange, Rgba, TextureLayer } from "./textureDocumentCore";

/** Clipboard buffer for region copy/paste — scoped to a single texture path. */
interface ClipboardRegion {
  texturePath: string;
  width: number;
  height: number;
  data: ImageData;
}

let clipboard: ClipboardRegion | null = null;
let layerIdCounter = 1;
const pendingLoads = new Map<string, Promise<TextureDoc>>();
let lifecycleVersion = 0;
let docAccessOrder: string[] = [];
let docLimit = 24;

export function setTextureDocumentCacheLimit(limit: number): void {
  docLimit = Math.max(4, limit);
  evictCleanTextureDocuments();
}

function touchDocAccess(path: string): void {
  docAccessOrder = docAccessOrder.filter((entry) => entry !== path);
  docAccessOrder.push(path);
}

function evictCleanTextureDocuments(): void {
  const docs = docsMap();
  while (docs.size > docLimit) {
    let evicted = false;
    const nextOrder: string[] = [];
    for (const path of docAccessOrder) {
      const doc = docs.get(path);
      if (!doc) continue;
      if (!evicted && !doc.dirty) {
        docs.delete(path);
        pendingLoads.delete(path);
        evicted = true;
        continue;
      }
      nextOrder.push(path);
    }
    docAccessOrder = nextOrder;
    if (!evicted) break;
  }
}

interface DocumentStoreState {
  revision: number;
  docs: Map<string, TextureDoc>;
}

const useDocumentStore = create<DocumentStoreState>(() => ({
  revision: 0,
  docs: new Map(),
}));

function docsMap(): Map<string, TextureDoc> {
  return useDocumentStore.getState().docs;
}

function notify(): void {
  useDocumentStore.setState((state) => ({ revision: state.revision + 1 }));
}

export function useDocumentRevision(): number {
  return useDocumentStore((s) => s.revision);
}

function nextLayerId(): string {
  layerIdCounter += 1;
  return `layer-${layerIdCounter}`;
}

function writeRgba(
  layer: LayerBuffers,
  x: number,
  y: number,
  rgba: Rgba,
): void {
  writeLayerRgba(layer, x, y, rgba);
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
    pixelCache: null,
    cacheWidth: 0,
    cacheHeight: 0,
    cacheDirty: false,
  };
}

export function getDoc(path: string): TextureDoc | undefined {
  const doc = docsMap().get(path);
  if (doc) touchDocAccess(path);
  return doc;
}

export function subscribeTextureDocuments(listener: () => void): () => void {
  return useDocumentStore.subscribe((state, prev) => {
    if (state.revision !== prev.revision) listener();
  });
}

export function clearTextureDocuments(): void {
  lifecycleVersion += 1;
  clipboard = null;
  docsMap().clear();
  pendingLoads.clear();
  docAccessOrder = [];
  notify();
}

export function isTextureDirty(path: string): boolean {
  return docsMap().get(path)?.dirty ?? false;
}

export function getDirtyTexturePaths(): string[] {
  return [...docsMap().entries()].filter(([, doc]) => doc.dirty).map(([path]) => path);
}

export function getTextureCanvas(path: string): HTMLCanvasElement | null {
  return docsMap().get(path)?.compositeCanvas ?? null;
}

export function getActiveLayerCanvas(path: string): HTMLCanvasElement | null {
  const doc = docsMap().get(path);
  if (!doc) return null;
  return activeLayer(doc).canvas;
}

export function getOriginalTextureCanvas(path: string): HTMLCanvasElement | null {
  return docsMap().get(path)?.originalCanvas ?? null;
}

export function listTextureLayers(path: string): TextureLayer[] {
  const doc = docsMap().get(path);
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
  return docsMap().get(path)?.activeLayerId ?? null;
}

export function getActiveLayerIndex(
  path: string,
): { index: number; total: number } | null {
  const doc = docsMap().get(path);
  if (!doc) return null;
  const index = doc.layers.findIndex((layer) => layer.id === doc.activeLayerId);
  if (index < 0) return { index: 1, total: doc.layers.length };
  return { index: index + 1, total: doc.layers.length };
}

export function setActiveLayer(path: string, layerId: string): void {
  const doc = docsMap().get(path);
  if (!doc || !getLayer(doc, layerId)) return;
  doc.activeLayerId = layerId;
  notify();
}

export function addTextureLayer(path: string): TextureLayer | null {
  const doc = docsMap().get(path);
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
  const doc = docsMap().get(path);
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
  const doc = docsMap().get(path);
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
  const doc = docsMap().get(path);
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
  const doc = docsMap().get(path);
  if (!doc) return false;
  const data = doc.compositeCtx.getImageData(x, y, width, height);
  clipboard = { texturePath: path, width, height, data };
  return true;
}

/** Paste clipboard content at (x, y) on the active layer. */
export function pasteRegion(path: string, x: number, y: number): PixelChange[] {
  const doc = docsMap().get(path);
  if (!doc || !clipboard || clipboard.texturePath !== path) return [];
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
      const before = readLayerRgba(layer, px, py);
      changes.push({ x: px, y: py, before, after, layerId: layer.id });
    }
  }
  return changes;
}

export function hasClipboard(texturePath?: string): boolean {
  if (!clipboard) return false;
  if (texturePath) return clipboard.texturePath === texturePath;
  return true;
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
  const versionAtStart = lifecycleVersion;
  const existing = docsMap().get(path);
  if (existing) {
    touchDocAccess(path);
    return existing;
  }
  const pending = pendingLoads.get(path);
  if (pending) return pending;

  const loadPromise = (async () => {
    const { image, width, height } = await loadImageForEditor(handle, path);
    if (versionAtStart !== lifecycleVersion) {
      throw new Error("texture document lifecycle invalidated during load");
    }

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
    invalidateLayerPixelCache(baseLayer);
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
      revision: 0,
      savedRevision: 0,
    };
    compositeDocument(doc);
    if (versionAtStart !== lifecycleVersion) {
      throw new Error("texture document lifecycle invalidated before commit");
    }
    docsMap().set(path, doc);
    touchDocAccess(path);
    evictCleanTextureDocuments();
    notify();
    return doc;
  })();

  pendingLoads.set(path, loadPromise);
  try {
    return await loadPromise;
  } finally {
    if (pendingLoads.get(path) === loadPromise) {
      pendingLoads.delete(path);
    }
  }
}

export function getPixel(path: string, x: number, y: number): Rgba | null {
  const doc = docsMap().get(path);
  if (!doc || !inBounds(doc, x, y)) return null;
  return readRgba(doc.compositeCtx, x, y);
}

export function getLayerPixel(
  path: string,
  layerId: string,
  x: number,
  y: number,
): Rgba | null {
  const doc = docsMap().get(path);
  const layer = doc ? getLayer(doc, layerId) : null;
  if (!doc || !layer || !inBounds(doc, x, y)) return null;
  return readLayerRgba(layer, x, y);
}

function applyChanges(
  doc: TextureDoc,
  changes: PixelChange[],
  recordUndo: boolean,
  label = "edit",
): void {
  applyChangesToDoc(doc, changes, recordUndo, label);
}

export function applyPatch(
  handle: ProjectHandle | null,
  path: string,
  changes: PixelChange[],
  recordUndo = true,
  label = "edit",
): void {
  commitChanges(handle, path, changes, recordUndo, label);
}

export function markDirty(path: string): void {
  const doc = docsMap().get(path);
  if (!doc) return;
  doc.dirty = true;
  doc.revision += 1;
  notify();
}

export async function snapshotForSave(
  path: string,
): Promise<{ path: string; pngBase64: string } | null> {
  const canvas = getTextureCanvas(path);
  if (!canvas) return null;
  return { path, pngBase64: await canvasToPngBase64(canvas) };
}

export function commitChanges(
  handle: ProjectHandle | null,
  path: string,
  changes: PixelChange[],
  recordUndo = true,
  label = "edit",
): void {
  const doc = docsMap().get(path);
  if (!doc) return;

  applyChanges(doc, changes, recordUndo, label);
  if (handle) {
    refreshTextureFromCanvas(handle, path, doc.compositeCanvas);
    void invalidateCatalogIconsForTextures(handle, [path]);
  }
  notify();
}

export function peekUndoLabel(path: string): string | null {
  const stack = docsMap().get(path)?.undo;
  if (!stack?.length) return null;
  return stack[stack.length - 1].label;
}

export function peekRedoLabel(path: string): string | null {
  const stack = docsMap().get(path)?.redo;
  if (!stack?.length) return null;
  return stack[stack.length - 1].label;
}

export function undoTexture(handle: ProjectHandle | null, path: string): boolean {
  const doc = docsMap().get(path);
  if (!doc || doc.undo.length === 0) return false;

  const entry = doc.undo.pop()!;
  const inverse: PixelChange[] = entry.changes.map((change) => ({
    x: change.x,
    y: change.y,
    before: change.after,
    after: change.before,
    layerId: change.layerId,
  }));

  for (const change of inverse) {
    const layer = getLayer(doc, change.layerId);
    if (!layer) continue;
    writeRgba(layer, change.x, change.y, change.after);
  }

  compositeDocument(doc);
  doc.revision = Math.max(0, doc.revision - 1);
  doc.redo.push({ changes: entry.changes, label: entry.label });
  doc.dirty = doc.revision !== doc.savedRevision;
  if (handle) {
    refreshTextureFromCanvas(handle, path, doc.compositeCanvas);
    void invalidateCatalogIconsForTextures(handle, [path]);
  }
  notify();
  return true;
}

export function redoTexture(handle: ProjectHandle | null, path: string): boolean {
  const doc = docsMap().get(path);
  if (!doc || doc.redo.length === 0) return false;

  const entry = doc.redo.pop()!;
  applyChanges(doc, entry.changes, false);
  doc.undo.push({ changes: entry.changes, label: entry.label });
  doc.dirty = doc.revision !== doc.savedRevision;
  if (handle) {
    refreshTextureFromCanvas(handle, path, doc.compositeCanvas);
    void invalidateCatalogIconsForTextures(handle, [path]);
  }
  notify();
  return true;
}

export function canUndo(path: string): boolean {
  return (docsMap().get(path)?.undo.length ?? 0) > 0;
}

export function canRedo(path: string): boolean {
  return (docsMap().get(path)?.redo.length ?? 0) > 0;
}

export function getActiveLayerContext(path: string): {
  layerId: string;
  width: number;
  height: number;
  locked: boolean;
} | null {
  const doc = docsMap().get(path);
  if (!doc) return null;
  const layer = activeLayer(doc);
  return {
    layerId: layer.id,
    width: doc.width,
    height: doc.height,
    locked: layer.locked,
  };
}

export { canvasToPngBase64 } from "./textureDocumentCore";

type SavedTextureSnapshot = {
  path: string;
  revision: number;
};

export function markTexturesSaved(
  savedPaths: string[],
  originalPaths?: string[],
  snapshots?: SavedTextureSnapshot[],
): void {
  const snapshotByPath = new Map<string, number>(
    snapshots?.map((item) => [item.path, item.revision]) ?? [],
  );
  const isSameRevision = (path: string, doc: TextureDoc): boolean => {
    const revisionAtSnapshot = snapshotByPath.get(path);
    return revisionAtSnapshot === undefined || revisionAtSnapshot === doc.revision;
  };
  const committedPaths = new Set<string>();

  if (originalPaths && originalPaths.length === savedPaths.length) {
    for (let i = 0; i < savedPaths.length; i++) {
      const original = originalPaths[i];
      const saved = savedPaths[i];
      if (original !== saved && docsMap().has(original)) {
        const doc = docsMap().get(original)!;
        if (!isSameRevision(original, doc)) {
          continue;
        }
        docsMap().delete(original);
        doc.savedRevision = doc.revision;
        doc.dirty = false;
        doc.dirtyBox = null;
        docsMap().set(saved, doc);
        committedPaths.add(saved);
      } else {
        const doc = docsMap().get(saved);
        if (doc && isSameRevision(saved, doc)) {
          doc.savedRevision = doc.revision;
          doc.dirty = false;
          doc.dirtyBox = null;
          committedPaths.add(saved);
        }
      }
    }
  } else {
    for (const path of savedPaths) {
      const doc = docsMap().get(path);
      if (doc && isSameRevision(path, doc)) {
        doc.savedRevision = doc.revision;
        doc.dirty = false;
        doc.dirtyBox = null;
        committedPaths.add(path);
      }
    }
  }

  for (const path of committedPaths) {
    const doc = docsMap().get(path);
    if (!doc) continue;
    const originalCtx = doc.originalCanvas.getContext("2d");
    if (!originalCtx) continue;
    originalCtx.clearRect(0, 0, doc.width, doc.height);
    originalCtx.drawImage(doc.compositeCanvas, 0, 0);
  }

  notify();
}

export async function collectDirtyTextureEntries(): Promise<
  { path: string; pngBase64: string; targetPath?: string; revision: number }[]
> {
  const paths = getDirtyTexturePaths();
  const encoded = await mapWithConcurrency(paths, 4, async (path) => {
    const doc = docsMap().get(path);
    const canvas = getTextureCanvas(path);
    if (!canvas || !doc) return null;
    return {
      path,
      pngBase64: await canvasToPngBase64(canvas),
      revision: doc.revision,
    };
  });
  return encoded.filter(
    (entry): entry is { path: string; pngBase64: string; revision: number } =>
      entry !== null,
  );
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
    const doc = docsMap().get(path);
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
