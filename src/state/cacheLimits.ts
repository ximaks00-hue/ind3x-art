export const MIN_TEXTURE_CACHE_LIMIT = 64;
export const MAX_TEXTURE_CACHE_LIMIT = 2048;
export const MIN_MODEL_CACHE_LIMIT = 8;
export const MAX_MODEL_CACHE_LIMIT = 512;

export function clampTextureCacheLimit(value: number): number {
  if (!Number.isFinite(value)) return MIN_TEXTURE_CACHE_LIMIT;
  return Math.max(
    MIN_TEXTURE_CACHE_LIMIT,
    Math.min(MAX_TEXTURE_CACHE_LIMIT, Math.round(value)),
  );
}

export function clampModelCacheLimit(value: number): number {
  if (!Number.isFinite(value)) return 256;
  return Math.max(
    MIN_MODEL_CACHE_LIMIT,
    Math.min(MAX_MODEL_CACHE_LIMIT, Math.round(value)),
  );
}
