/**
 * Web Worker implementation for heavy pixel operations (flood fill, etc.).
 * Exposed via Comlink so the main thread can call it like an async function.
 */
import * as Comlink from "comlink";

import {
  floodFillAlgorithm,
  magicWandAlgorithm,
  type WorkerPixelChange,
} from "./pixelAlgorithms";

export type { WorkerPixelChange };

export interface FloodFillArgs {
  imageData: ImageData;
  startX: number;
  startY: number;
  fillR: number;
  fillG: number;
  fillB: number;
  fillA: number;
  tolerance: number;
}

function floodFill(args: FloodFillArgs): WorkerPixelChange[] {
  const { imageData, startX, startY, fillR, fillG, fillB, fillA, tolerance } = args;
  const data = new Uint8ClampedArray(imageData.data);
  return floodFillAlgorithm({
    data,
    width: imageData.width,
    height: imageData.height,
    startX,
    startY,
    fillR,
    fillG,
    fillB,
    fillA,
    tolerance,
  });
}

export interface MagicWandArgs {
  imageData: ImageData;
  startX: number;
  startY: number;
  tolerance: number;
}

function magicWand(args: MagicWandArgs): [number, number, number, number] | null {
  const { imageData, startX, startY, tolerance } = args;
  return magicWandAlgorithm({
    data: imageData.data,
    width: imageData.width,
    height: imageData.height,
    startX,
    startY,
    tolerance,
  });
}

const workerApi = { floodFill, magicWand };
export type PixelWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
