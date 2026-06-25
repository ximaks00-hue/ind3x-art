import * as THREE from "three";

import { ipc } from "../../ipc/client";
import { base64ToUint8ArrayAsync } from "../../ipc/binary";
import type {
  ProjectHandle,
  TextureAnimationMeta,
  TextureMetaInfo,
} from "../../ipc/types";

const cache = new Map<string, THREE.Texture>();
const inflightLoads = new Map<string, Promise<THREE.Texture>>();
const animationStates = new Map<string, TextureAnimationState>();
let cacheLimit = 512;
let maxCacheBytes = 128 * 1024 * 1024;
let totalCacheBytes = 0;

function estimateTextureBytes(texture: THREE.Texture): number {
  const image = texture.image as { width?: number; height?: number } | null;
  const width = image?.width ?? 16;
  const height = image?.height ?? 16;
  return width * height * 4;
}

function evictExcessTextures(): void {
  while (cache.size > cacheLimit || totalCacheBytes > maxCacheBytes) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined || cache.size <= 1) break;
    disposeCachedTexture(oldest);
  }
}

function disposeCachedTexture(key: string): void {
  const texture = cache.get(key);
  if (texture) {
    totalCacheBytes -= estimateTextureBytes(texture);
    texture.dispose();
    cache.delete(key);
  }
  animationStates.delete(key);
}

function touchCachedTexture(key: string, texture: THREE.Texture): THREE.Texture {
  const existing = cache.get(key);
  if (existing === texture) {
    cache.delete(key);
    cache.set(key, texture);
    evictExcessTextures();
    return texture;
  }
  if (existing) {
    totalCacheBytes -= estimateTextureBytes(existing);
    cache.delete(key);
  }
  cache.set(key, texture);
  totalCacheBytes += estimateTextureBytes(texture);
  evictExcessTextures();
  return texture;
}

function branchCachedTexture(key: string, cached: THREE.Texture): THREE.Texture {
  touchCachedTexture(key, cached);
  return cached;
}

export function setViewerTextureCacheLimit(limit: number): void {
  cacheLimit = Math.max(8, limit);
  maxCacheBytes = Math.max(8 * 1024 * 1024, limit * 256 * 1024);
  evictExcessTextures();
}

export interface TextureAnimationState {
  meta: TextureAnimationMeta;
  frameIndex: number;
  elapsed: number;
  paused?: boolean;
}

function cacheKey(handle: ProjectHandle, path: string): string {
  return `${handle.id}:${path}`;
}

function applyAnimationFrameToTexture(texture: THREE.Texture, state: TextureAnimationState): void {
  const { meta, frameIndex } = state;
  const frame = meta.frames[frameIndex] ?? 0;
  const image = texture.image as { height: number };
  const frameHeight = meta.frameHeight || image.height;
  const totalHeight = image.height;

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, frameHeight / totalHeight);
  texture.offset.set(0, 1 - (frame + 1) * (frameHeight / totalHeight));
  texture.needsUpdate = true;
}

function syncAnimationFrame(key: string): void {
  const state = animationStates.get(key);
  const texture = cache.get(key);
  if (!state || !texture) return;
  applyAnimationFrameToTexture(texture, state);
}

export function releaseCanvasElement(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export function disposeViewerTexture(handle: ProjectHandle, path: string): void {
  disposeCachedTexture(cacheKey(handle, path));
}

export function clearTextureCache(handle?: ProjectHandle): void {
  if (!handle) {
    for (const key of [...cache.keys()]) disposeCachedTexture(key);
    inflightLoads.clear();
    return;
  }
  const prefix = `${handle.id}:`;
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix)) disposeCachedTexture(key);
  }
  for (const key of [...inflightLoads.keys()]) {
    if (key.startsWith(prefix)) inflightLoads.delete(key);
  }
}

async function decodeTextureImage(
  handle: ProjectHandle,
  path: string,
): Promise<HTMLImageElement> {
  try {
    const bytes = await ipc.getTextureBinary(handle, path);
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    return new Promise<HTMLImageElement>((resolve, reject) => {
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
  } catch {
    const data = await ipc.getTexture(handle, path);
    const bytes = await base64ToUint8ArrayAsync(data.pngBase64);
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`failed to decode texture: ${path}`));
      };
      img.src = url;
    });
  }
}

async function loadTextureBase(
  handle: ProjectHandle,
  path: string,
  meta?: TextureMetaInfo,
): Promise<THREE.Texture> {
  const key = cacheKey(handle, path);
  const cached = cache.get(key);
  if (cached) return cached;

  const inflight = inflightLoads.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    const image = await decodeTextureImage(handle, path);
    const texture = new THREE.Texture(image);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    if (meta?.animation && meta.animation.frames.length > 0) {
      animationStates.set(key, {
        meta: meta.animation,
        frameIndex: 0,
        elapsed: 0,
      });
    }

    touchCachedTexture(key, texture);
    return texture;
  })();

  inflightLoads.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightLoads.delete(key);
  }
}

export async function loadTexture(
  handle: ProjectHandle,
  path: string,
  meta?: TextureMetaInfo,
): Promise<THREE.Texture> {
  const key = cacheKey(handle, path);
  const cached = cache.get(key);
  if (cached) return branchCachedTexture(key, cached);
  const base = await loadTextureBase(handle, path, meta);
  return branchCachedTexture(key, base);
}

export function refreshTextureFromCanvas(
  handle: ProjectHandle,
  path: string,
  canvas: HTMLCanvasElement,
): void {
  const key = cacheKey(handle, path);
  const existing = cache.get(key);
  if (existing) {
    totalCacheBytes -= estimateTextureBytes(existing);
    existing.dispose();
    cache.delete(key);
  }

  const texture = new THREE.Texture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  touchCachedTexture(key, texture);
  syncAnimationFrame(key);
}

export function tickAnimatedTextures(deltaSeconds: number): void {
  for (const [key, state] of animationStates) {
    if (state.meta.frames.length === 0) continue;
    if (state.paused) continue;

    const tickSeconds = state.meta.frametime / 20;
    state.elapsed += deltaSeconds;
    let advanced = false;
    while (state.elapsed >= tickSeconds) {
      state.elapsed -= tickSeconds;
      state.frameIndex = (state.frameIndex + 1) % state.meta.frames.length;
      advanced = true;
    }
    if (advanced) syncAnimationFrame(key);
  }
}

/** Seek a cached animated texture to a specific frame (studio preview / editor scrub). */
export async function seekAnimatedTextureFrame(
  handle: ProjectHandle,
  path: string,
  frameIndex: number,
  meta?: TextureMetaInfo,
): Promise<void> {
  const key = cacheKey(handle, path);
  if (!cache.has(key)) {
    try {
      await loadTextureBase(handle, path, meta);
    } catch {
      return;
    }
  }

  const state = animationStates.get(key);
  if (!state || state.meta.frames.length === 0) return;

  const clamped = Math.max(0, Math.min(frameIndex, state.meta.frames.length - 1));
  state.frameIndex = clamped;
  state.elapsed = 0;
  state.paused = true;
  syncAnimationFrame(key);
}

/** Resume automatic animation ticking for a texture. */
export function resumeAnimatedTexture(path: string, handle: ProjectHandle): void {
  const state = animationStates.get(cacheKey(handle, path));
  if (state) state.paused = false;
}

/** Named biome tint palettes for tintindex-based recolouring. */
export const BIOME_TINT_PALETTES: Record<string, { foliage: number; grass: number }> = {
  plains: { foliage: 0x77ab2f, grass: 0x91bd59 },
  forest: { foliage: 0x59ae30, grass: 0x79c05a },
  desert: { foliage: 0xae9b55, grass: 0xbfb755 },
  taiga: { foliage: 0x86b783, grass: 0x86b783 },
  swamp: { foliage: 0x6a7039, grass: 0x6a7039 },
  ocean: { foliage: 0x71a74d, grass: 0x8eb971 },
  jungle: { foliage: 0x30bb0b, grass: 0x59c93c },
  mountains: { foliage: 0x6da36b, grass: 0x8ab689 },
  snowy: { foliage: 0x60a17b, grass: 0x80b497 },
  nether: { foliage: 0x77ab2f, grass: 0x91bd59 },
};

let activeBiome = "plains";

export function setActiveBiome(biome: string): void {
  activeBiome = biome;
}

export function getActiveBiome(): string {
  return activeBiome;
}

export function tintColorForIndex(tintindex: number): THREE.Color | null {
  if (tintindex < 0) return null;
  const palette = BIOME_TINT_PALETTES[activeBiome] ?? BIOME_TINT_PALETTES.plains;
  // tintindex 0 = grass, 1 = foliage, 2+ = foliage
  const hex = tintindex === 0 ? palette.grass : palette.foliage;
  return new THREE.Color(hex);
}
