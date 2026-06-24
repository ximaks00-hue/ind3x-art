import * as THREE from "three";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { CAMERA_PRESET_TRANSFORMS } from "../../lib/cameraPresets";
import { buildModelGroup, disposeObject3D } from "../viewer3d/buildMesh";

const ICON_SIZE = 48;

let sharedRenderer: THREE.WebGLRenderer | null = null;

function getSharedRenderer(size: number): THREE.WebGLRenderer {
  if (!sharedRenderer) {
    const canvas = document.createElement("canvas");
    sharedRenderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
  }
  sharedRenderer.setSize(size, size, false);
  sharedRenderer.setClearColor(0x000000, 0);
  return sharedRenderer;
}

export function disposeCatalogIconRenderer(): void {
  sharedRenderer?.dispose();
  sharedRenderer = null;
}

/**
 * Tier-1 fast icon: flat texture preview scaled to catalog cell size.
 */
export async function bakeCatalogIconFromPreview(
  pngBase64: string,
  size = ICON_SIZE,
): Promise<string> {
  return bakeCatalogIconFromPreviewAsync(pngBase64, size);
}

export async function bakeCatalogIconFromPreviewAsync(
  pngBase64: string,
  size = ICON_SIZE,
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  try {
    const isVitest =
      (typeof process !== "undefined" && Boolean(process.env.VITEST)) ||
      import.meta.env.MODE === "test";
    if (isVitest) {
      const { loadImage } = await import("canvas");
      const img = await loadImage(Buffer.from(pngBase64, "base64"));
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img as unknown as CanvasImageSource, 0, 0, size, size);
      return canvas.toDataURL("image/png");
    }
  } catch {
    // fall through to browser Image path
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = `data:image/png;base64,${pngBase64}`;
  });
}

/**
 * Tier-2: offscreen Three.js GUI render (Phase 0 spike).
 * Returns null when WebGL is not available.
 */
export async function bakeCatalogIcon3d(
  model: RenderableModel,
  handle: ProjectHandle,
  size = ICON_SIZE,
): Promise<string | null> {
  try {
    const renderer = getSharedRenderer(size);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    const preset = CAMERA_PRESET_TRANSFORMS.inventory;
    camera.position.set(...preset.position);
    camera.lookAt(...preset.target);

    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    const dir = new THREE.DirectionalLight(0xffffff, 0.65);
    dir.position.set(2, 4, 3);
    scene.add(ambient, dir);

    const group = await buildModelGroup(model, handle, "gui");
    scene.add(group);

    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");

    disposeObject3D(group);
    scene.clear();

    return dataUrl;
  } catch {
    return null;
  }
}

export async function bakeCatalogIconsBatch(
  items: { pngBase64: string }[],
  size = ICON_SIZE,
): Promise<string[]> {
  const results: string[] = [];
  for (const item of items) {
    results.push(await bakeCatalogIconFromPreviewAsync(item.pngBase64, size));
  }
  return results;
}
