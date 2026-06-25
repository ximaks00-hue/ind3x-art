import * as Comlink from "comlink";
import type { Remote } from "comlink";

import { withProgressToast } from "../../lib/asyncWithProgress";
import type { PaintStrokeContext } from "./paintEngine";
import {
  isPaintOperationCurrent,
  nextPaintOperationGen,
} from "./paintOperationGen";
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
  changes: WorkerPixelChange[],
  layerId: string,
): PixelChange[] {
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
  const layerId = getActiveLayerId(texturePath);
  const layerCanvas = layerId ? getActiveLayerCanvas(texturePath) : null;
  if (!layerId || !layerCanvas) {
    onComplete?.();
    return;
  }

  const opGen = nextPaintOperationGen(texturePath);

  const runSync = () => {
    if (!isPaintOperationCurrent(texturePath, opGen)) return;
    const changes = floodFillChanges(texturePath, x, y, color, tolerance);
    if (changes.length > 0) {
      commitChanges(handle, texturePath, changes, true, "Fill", true);
    }
  };

  const ctx2 = layerCanvas.getContext("2d");
  if (!worker || !ctx2) {
    runSync();
    onComplete?.();
    return;
  }

  // TEC-001: Canvas2D requires main-thread getImageData; Comlink.transfer moves the buffer
  // to the worker without a second copy.
  const imageData = ctx2.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
  const [fr, fg, fb, fa] = hexToRgba(color);
  let completed = false;
  const finish = () => {
    if (completed) return;
    completed = true;
    onComplete?.();
  };

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
      if (!isPaintOperationCurrent(texturePath, opGen)) return;
      const changes = workerChangesToPixelChanges(workerChanges, layerId);
      if (changes.length > 0) {
        commitChanges(handle, texturePath, changes, true, "Fill", true);
      }
    } catch (error) {
      console.warn("[paint] flood fill worker failed, falling back to main thread", error);
      runSync();
    } finally {
      finish();
    }
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
  const tolerance = fillTolerance ?? 0;
  const layerCanvas = getActiveLayerCanvas(texturePath);
  if (!layerCanvas) {
    onSelection(null);
    return;
  }

  const opGen = nextPaintOperationGen(texturePath);

  const runSync = () => {
    if (!isPaintOperationCurrent(texturePath, opGen)) return;
    onSelection(magicWandSelection(texturePath, x, y, tolerance));
  };

  const ctx2 = layerCanvas.getContext("2d");
  if (!worker || !ctx2) {
    runSync();
    return;
  }

  // TEC-001: see flood-fill path above.
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
      if (!isPaintOperationCurrent(texturePath, opGen)) return;
      onSelection(sel);
    } catch (error) {
      console.warn("[paint] magic wand worker failed, falling back to main thread", error);
      runSync();
    }
  });
}
