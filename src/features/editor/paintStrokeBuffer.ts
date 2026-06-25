import type { PixelChange } from "./textureDocumentCore";

const strokeBuffers = new Map<string, PixelChange[]>();
const strokeLayerIds = new Map<string, string>();
const activeStrokes = new Set<string>();

export function beginBrushStroke(texturePath: string, layerId?: string): void {
  activeStrokes.add(texturePath);
  strokeBuffers.set(texturePath, []);
  if (layerId) {
    strokeLayerIds.set(texturePath, layerId);
  } else {
    strokeLayerIds.delete(texturePath);
  }
}

export function getBrushStrokeLayerId(texturePath: string): string | undefined {
  return strokeLayerIds.get(texturePath);
}

export function isBrushStrokeActive(texturePath: string): boolean {
  return activeStrokes.has(texturePath);
}

export function appendBrushStrokeChanges(texturePath: string, changes: PixelChange[]): void {
  if (!activeStrokes.has(texturePath) || changes.length === 0) return;
  const buffer = strokeBuffers.get(texturePath);
  if (buffer) buffer.push(...changes);
}

export function takeBrushStrokeChanges(texturePath: string): PixelChange[] {
  activeStrokes.delete(texturePath);
  strokeLayerIds.delete(texturePath);
  const raw = strokeBuffers.get(texturePath) ?? [];
  strokeBuffers.delete(texturePath);
  return coalescePixelChanges(raw);
}

export function cancelBrushStroke(texturePath: string): void {
  activeStrokes.delete(texturePath);
  strokeLayerIds.delete(texturePath);
  strokeBuffers.delete(texturePath);
}

/** Merge multiple edits to the same pixel into one undo entry (first before, last after). */
export function coalescePixelChanges(changes: PixelChange[]): PixelChange[] {
  const byKey = new Map<string, PixelChange>();
  for (const change of changes) {
    const key = `${change.layerId}:${change.x},${change.y}`;
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...change,
        before: existing.before,
      });
    } else {
      byKey.set(key, change);
    }
  }
  return [...byKey.values()];
}
