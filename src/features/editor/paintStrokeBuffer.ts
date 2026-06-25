import type { PixelChange } from "./textureDocumentCore";

const strokeBuffers = new Map<string, PixelChange[]>();
const activeStrokes = new Set<string>();

export function beginBrushStroke(texturePath: string): void {
  activeStrokes.add(texturePath);
  strokeBuffers.set(texturePath, []);
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
  const raw = strokeBuffers.get(texturePath) ?? [];
  strokeBuffers.delete(texturePath);
  return coalescePixelChanges(raw);
}

export function cancelBrushStroke(texturePath: string): void {
  activeStrokes.delete(texturePath);
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
