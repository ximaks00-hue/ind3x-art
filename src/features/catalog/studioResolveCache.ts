import type { RenderableModel } from "../../ipc/types";

const MAX_ENTRIES_DEFAULT = 64;
let maxEntries = MAX_ENTRIES_DEFAULT;

export function setStudioResolveCacheLimit(limit: number): void {
  maxEntries = Math.max(8, Math.min(limit, 512));
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

const cache = new Map<string, RenderableModel>();

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
  if (cache.has(key)) cache.delete(key);
  cache.set(key, model);
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export function clearStudioResolveCacheForHandle(handleId: number): void {
  const prefix = `${handleId}:`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

export function clearStudioResolveCache(): void {
  cache.clear();
}
