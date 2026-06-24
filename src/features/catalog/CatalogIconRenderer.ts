import {
  AmbientLight,
  DirectionalLight,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { buildModelGroup, disposeObject3D } from "../viewer3d/buildMesh";

const ICON_SIZE = 48;

/** Soft Creative-inventory style lighting (ambient-heavy, gentle key light). */
const ICON_LIGHTING = {
  ambient: { color: 0xffffff, intensity: 1.0 },
  key: { color: 0xfff8f0, intensity: 0.35, position: [1.2, 2.5, 2.0] as const },
};

type QueueTask<T> = () => Promise<T>;

function createAsyncQueue(maxInflight: number) {
  let active = 0;
  const pending: Array<{
    task: QueueTask<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }> = [];

  const pump = () => {
    while (active < maxInflight && pending.length > 0) {
      const job = pending.shift()!;
      active += 1;
      void job
        .task()
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };

  return {
    run<T>(task: QueueTask<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        pending.push({
          task: task as QueueTask<unknown>,
          resolve: resolve as (value: unknown) => void,
          reject,
        });
        pump();
      });
    },
  };
}

/** Serialize 3D icon bakes — one shared WebGLRenderer cannot render concurrently. */
const iconRenderQueue = createAsyncQueue(1);

let sharedRenderer: WebGLRenderer | null = null;

function getSharedRenderer(size: number): WebGLRenderer {
  if (!sharedRenderer) {
    const canvas = document.createElement("canvas");
    sharedRenderer = new WebGLRenderer({
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
 * Tier-1 fallback: flat texture preview scaled to catalog cell size.
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
 * Inventory GUI 3D icon bake — uses display.gui transform and MC-like lighting.
 */
export async function bakeCatalogIcon3d(
  model: RenderableModel,
  handle: ProjectHandle,
  size = ICON_SIZE,
): Promise<string | null> {
  return iconRenderQueue.run(async () => {
    try {
      const renderer = getSharedRenderer(size);
      const scene = new Scene();
      const camera = new OrthographicCamera(-0.55, 0.55, 0.55, -0.55, 0.1, 10);
      camera.position.set(0, 0, 3);
      camera.lookAt(0, 0, 0);

      const ambient = new AmbientLight(
        ICON_LIGHTING.ambient.color,
        ICON_LIGHTING.ambient.intensity,
      );
      const key = new DirectionalLight(
        ICON_LIGHTING.key.color,
        ICON_LIGHTING.key.intensity,
      );
      key.position.set(...ICON_LIGHTING.key.position);
      scene.add(ambient, key);

      const group = await buildModelGroup(model, handle, "gui");
      scene.add(group);

      renderer.render(scene, camera);

      const out = document.createElement("canvas");
      out.width = size;
      out.height = size;
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(renderer.domElement, 0, 0, size, size);
      const dataUrl = out.toDataURL("image/png");

      disposeObject3D(group);
      scene.clear();

      return dataUrl;
    } catch (error) {
      console.warn("[CatalogIconRenderer] 3D icon bake failed", error);
      throw error;
    }
  });
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
