const generationByPath = new Map<string, number>();

/** Bump and return the next generation token for a texture path (invalidates in-flight ops). */
export function nextPaintOperationGen(texturePath: string): number {
  const next = (generationByPath.get(texturePath) ?? 0) + 1;
  generationByPath.set(texturePath, next);
  return next;
}

export function currentPaintOperationGen(texturePath: string): number {
  return generationByPath.get(texturePath) ?? 0;
}

export function isPaintOperationCurrent(texturePath: string, gen: number): boolean {
  return currentPaintOperationGen(texturePath) === gen;
}
