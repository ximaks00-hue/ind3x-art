import * as THREE from "three";

import { ipc } from "../../ipc/client";
import type {
  ProjectHandle,
  TextureAnimationMeta,
  TextureMetaInfo,
} from "../../ipc/types";

const cache = new Map<string, THREE.Texture>();
let cacheLimit = 512;

function evictExcessTextures(): void {
  while (cache.size > cacheLimit) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.get(oldest)?.dispose();
    cache.delete(oldest);
  }
}

function touchCachedTexture(key: string, texture: THREE.Texture): THREE.Texture {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, texture);
  evictExcessTextures();
  return texture;
}

export function setViewerTextureCacheLimit(limit: number): void {
  cacheLimit = Math.max(8, limit);
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

function applyAnimationFrame(texture: THREE.Texture, state: TextureAnimationState): void {
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

export function clearTextureCache(handle?: ProjectHandle): void {
  if (!handle) {
    for (const tex of cache.values()) tex.dispose();
    cache.clear();
    return;
  }
  const prefix = `${handle.id}:`;
  for (const [key, tex] of cache) {
    if (key.startsWith(prefix)) {
      tex.dispose();
      cache.delete(key);
    }
  }
}

export async function loadTexture(
  handle: ProjectHandle,
  path: string,
  meta?: TextureMetaInfo,
): Promise<THREE.Texture> {
  const key = cacheKey(handle, path);
  const cached = cache.get(key);
  if (cached) {
    return touchCachedTexture(key, cached);
  }

  // Use binary IPC to avoid base64 overhead when available
  const image = await (async () => {
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
      // Fallback to base64 JSON path
      const data = await ipc.getTexture(handle, path);
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`failed to decode texture: ${path}`));
        img.src = `data:image/png;base64,${data.pngBase64}`;
      });
    }
  })();

  const texture = new THREE.Texture(image);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  if (meta?.animation && meta.animation.frames.length > 0) {
    const animState: TextureAnimationState = {
      meta: meta.animation,
      frameIndex: 0,
      elapsed: 0,
    };
    texture.userData.animation = animState;
    applyAnimationFrame(texture, animState);
  }

  touchCachedTexture(key, texture);
  return texture;
}

export function refreshTextureFromCanvas(
  handle: ProjectHandle,
  path: string,
  canvas: HTMLCanvasElement,
): void {
  const key = cacheKey(handle, path);
  const existing = cache.get(key);
  if (existing) {
    existing.image = canvas;
    existing.needsUpdate = true;
    touchCachedTexture(key, existing);
    return;
  }

  const texture = new THREE.Texture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  touchCachedTexture(key, texture);
}

export function tickAnimatedTextures(deltaSeconds: number): void {
  for (const texture of cache.values()) {
    const state = texture.userData.animation as TextureAnimationState | undefined;
    if (!state || state.meta.frames.length === 0) continue;
    if (state.paused) continue;

    const tickSeconds = state.meta.frametime / 20;
    state.elapsed += deltaSeconds;
    while (state.elapsed >= tickSeconds) {
      state.elapsed -= tickSeconds;
      state.frameIndex = (state.frameIndex + 1) % state.meta.frames.length;
      applyAnimationFrame(texture, state);
    }
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
  let texture = cache.get(key);
  if (!texture) {
    try {
      texture = await loadTexture(handle, path, meta);
    } catch {
      return;
    }
  }

  const state = texture.userData.animation as TextureAnimationState | undefined;
  if (!state || state.meta.frames.length === 0) return;

  const clamped = Math.max(0, Math.min(frameIndex, state.meta.frames.length - 1));
  state.frameIndex = clamped;
  state.elapsed = 0;
  state.paused = true;
  applyAnimationFrame(texture, state);
}

/** Resume automatic animation ticking for a texture. */
export function resumeAnimatedTexture(path: string, handle: ProjectHandle): void {
  const texture = cache.get(cacheKey(handle, path));
  const state = texture?.userData.animation as TextureAnimationState | undefined;
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
