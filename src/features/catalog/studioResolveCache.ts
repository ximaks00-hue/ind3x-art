import type { RenderableModel } from "../../ipc/types";

const MAX_ENTRIES_DEFAULT = 64;
const MAX_BYTES = 64 * 1024 * 1024;
let maxEntries = MAX_ENTRIES_DEFAULT;

function estimateModelBytes(model: RenderableModel): number {
  const texturePaths = Object.keys(model.textureMeta ?? {}).length;
  const cuboidFaces = (model.cuboids ?? []).reduce(
    (sum, cuboid) => sum + cuboid.faces.length,
    0,
  );
  return texturePaths * 64 * 1024 + cuboidFaces * 256;
}

const cache = new Map<string, RenderableModel>();
let totalBytes = 0;

export function setStudioResolveCacheLimit(limit: number): void {
  maxEntries = Math.max(8, Math.min(limit, 512));
  evictWhileOverBudget();
}

function evictWhileOverBudget(): void {
  while ((cache.size > maxEntries || totalBytes > MAX_BYTES) && cache.size > 1) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    const removed = cache.get(oldest);
    if (removed) totalBytes -= estimateModelBytes(removed);
    cache.delete(oldest);
  }
}

export function studioResolveKey(
  handleId: number,
  entryId: string,
  variantKey?: string | null,
): string {
  return `${handleId}:${entryId}:${variantKey ?? ""}`;
}

export function getStudioResolveCache(key: string): RenderableModel | undefined {
  const hit = cache.get(key);
  if (!hit) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

export function setStudioResolveCache(key: string, model: RenderableModel): void {
  const existing = cache.get(key);
  if (existing) {
    totalBytes -= estimateModelBytes(existing);
    cache.delete(key);
  }
  cache.set(key, model);
  totalBytes += estimateModelBytes(model);
  evictWhileOverBudget();
}

export function clearStudioResolveCacheForHandle(handleId: number): void {
  const prefix = `${handleId}:`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) {
      const removed = cache.get(key);
      if (removed) totalBytes -= estimateModelBytes(removed);
      cache.delete(key);
    }
  }
}

export function clearStudioResolveCache(): void {
  cache.clear();
  totalBytes = 0;
}
