import * as Comlink from "comlink";
import type { Remote } from "comlink";

import { withProgressToast } from "../../lib/asyncWithProgress";
import type { PaintStrokeContext } from "./paintEngine";
import type { PixelWorkerApi, WorkerPixelChange } from "./pixelWorker";
import { floodFillChanges, hexToRgba, magicWandSelection } from "./tools";
import {
  commitChanges,
  getActiveLayerCanvas,
  getActiveLayerId,
  type PixelChange,
} from "./textureDocument";
import { trackPixelWorkerTask } from "./pixelWorkerClient";

export function workerChangesToPixelChanges(
  path: string,
  changes: WorkerPixelChange[],
): PixelChange[] {
  const layerId = getActiveLayerId(path);
  if (!layerId) return [];
  return changes.map((change) => ({
    x: change.x,
    y: change.y,
    before: change.before,
    after: change.after,
    layerId,
  }));
}

export async function applyFillAtPixel(
  ctx: PaintStrokeContext,
  x: number,
  y: number,
  worker: Remote<PixelWorkerApi> | null,
  onComplete?: () => void,
): Promise<void> {
  const { handle, texturePath, color, fillTolerance } = ctx;
  const tolerance = fillTolerance ?? 0;
  const layerCanvas = getActiveLayerCanvas(texturePath);
  if (!layerCanvas) {
    onComplete?.();
    return;
  }

  const runSync = () => {
    const changes = floodFillChanges(texturePath, x, y, color, tolerance);
    commitChanges(handle, texturePath, changes, true, "Fill", true);
    onComplete?.();
  };

  const ctx2 = layerCanvas.getContext("2d");
  if (!worker || !ctx2) {
    runSync();
    return;
  }

  const imageData = ctx2.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
  const [fr, fg, fb, fa] = hexToRgba(color);
  await withProgressToast("Flood fill", async () => {
    try {
      const workerChanges = await trackPixelWorkerTask(
        worker.floodFill(
          Comlink.transfer(
            {
              imageData,
              startX: x,
              startY: y,
              fillR: fr,
              fillG: fg,
              fillB: fb,
              fillA: fa,
              tolerance,
            },
            [imageData.data.buffer],
          ),
        ),
      );
      const changes = workerChangesToPixelChanges(texturePath, workerChanges);
      if (changes.length > 0) {
        commitChanges(handle, texturePath, changes, true, "Fill", true);
      }
    } catch (error) {
      console.warn("[paint] flood fill worker failed, falling back to main thread", error);
      runSync();
    }
    onComplete?.();
  });
}

export async function applyWandAtPixel(
  ctx: PaintStrokeContext,
  x: number,
  y: number,
  worker: Remote<PixelWorkerApi> | null,
  onSelection: (sel: [number, number, number, number] | null) => void,
): Promise<void> {
  const { texturePath, fillTolerance } = ctx;
  const tolerance = fillTolerance ?? 30;
  const layerCanvas = getActiveLayerCanvas(texturePath);
  if (!layerCanvas) {
    onSelection(null);
    return;
  }

  const runSync = () => {
    const sel = magicWandSelection(texturePath, x, y, tolerance);
    onSelection(sel);
  };

  const ctx2 = layerCanvas.getContext("2d");
  if (!worker || !ctx2) {
    runSync();
    return;
  }

  const imageData = ctx2.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
  await withProgressToast("Magic wand", async () => {
    try {
      const sel = await trackPixelWorkerTask(
        worker.magicWand(
          Comlink.transfer(
            {
              imageData,
              startX: x,
              startY: y,
              tolerance,
            },
            [imageData.data.buffer],
          ),
        ),
      );
      onSelection(sel);
    } catch (error) {
      console.warn("[paint] magic wand worker failed, falling back to main thread", error);
      runSync();
    }
  });
}
