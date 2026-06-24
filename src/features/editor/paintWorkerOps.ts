import type { Remote } from "comlink";

import { withProgressToast } from "../../lib/asyncWithProgress";
import type { PaintStrokeContext } from "./paintEngine";
import type { PixelWorkerApi } from "./pixelWorker";
import { floodFillChanges, hexToRgba, magicWandSelection } from "./tools";
import {
  commitChanges,
  getActiveLayerId,
  getTextureCanvas,
  type PixelChange,
} from "./textureDocument";

function diffImageDataChanges(
  path: string,
  before: ImageData,
  after: ImageData,
  canvasWidth: number,
): PixelChange[] {
  const layerId = getActiveLayerId(path);
  if (!layerId) return [];

  const changes: PixelChange[] = [];
  const orig = before.data;
  const next = after.data;
  for (let i = 0; i < orig.length; i += 4) {
    if (
      orig[i] !== next[i] ||
      orig[i + 1] !== next[i + 1] ||
      orig[i + 2] !== next[i + 2] ||
      orig[i + 3] !== next[i + 3]
    ) {
      const px = (i / 4) % canvasWidth;
      const py = Math.floor(i / 4 / canvasWidth);
      changes.push({
        x: px,
        y: py,
        before: [orig[i], orig[i + 1], orig[i + 2], orig[i + 3]],
        after: [next[i], next[i + 1], next[i + 2], next[i + 3]],
        layerId,
      });
    }
  }
  return changes;
}

export async function applyFillAtPixel(
  ctx: PaintStrokeContext,
  x: number,
  y: number,
  worker: Remote<PixelWorkerApi> | null,
  onComplete?: () => void,
): Promise<void> {
  const { handle, texturePath, color, fillTolerance } = ctx;
  const canvas = getTextureCanvas(texturePath);
  if (!canvas) return;

  const runSync = () => {
    const changes = floodFillChanges(texturePath, x, y, color);
    commitChanges(handle, texturePath, changes, true, "Fill");
    onComplete?.();
  };

  const ctx2 = canvas.getContext("2d");
  if (!worker || !ctx2) {
    runSync();
    return;
  }

  const imageData = ctx2.getImageData(0, 0, canvas.width, canvas.height);
  const [fr, fg, fb, fa] = hexToRgba(color);
  await withProgressToast("Flood fill", async () => {
    try {
      const filled = await worker.floodFill({
        imageData,
        startX: x,
        startY: y,
        fillR: fr,
        fillG: fg,
        fillB: fb,
        fillA: fa,
        tolerance: fillTolerance ?? 0,
      });
      const changes = diffImageDataChanges(texturePath, imageData, filled, canvas.width);
      if (changes.length > 0) {
        commitChanges(handle, texturePath, changes, true, "Fill");
      }
    } catch {
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
  onSelection: (sel: [number, number, number, number]) => void,
): Promise<void> {
  const { texturePath, fillTolerance } = ctx;
  const canvas = getTextureCanvas(texturePath);
  if (!canvas) return;

  const runSync = () => {
    const sel = magicWandSelection(texturePath, x, y, fillTolerance || 30);
    if (sel) onSelection(sel);
  };

  const ctx2 = canvas.getContext("2d");
  if (!worker || !ctx2) {
    runSync();
    return;
  }

  const imageData = ctx2.getImageData(0, 0, canvas.width, canvas.height);
  await withProgressToast("Magic wand", async () => {
    try {
      const sel = await worker.magicWand({
        imageData,
        startX: x,
        startY: y,
        tolerance: fillTolerance || 30,
      });
      if (sel) onSelection(sel);
    } catch {
      runSync();
    }
  });
}
