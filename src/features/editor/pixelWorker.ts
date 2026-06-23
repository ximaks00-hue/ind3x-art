/**
 * Web Worker implementation for heavy pixel operations (flood fill, etc.).
 * Exposed via Comlink so the main thread can call it like an async function.
 */
import * as Comlink from "comlink";

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

function colorMatch(
  data: Uint8ClampedArray,
  idx: number,
  r: number,
  g: number,
  b: number,
  a: number,
  tolerance: number,
): boolean {
  return (
    Math.abs(data[idx] - r) <= tolerance &&
    Math.abs(data[idx + 1] - g) <= tolerance &&
    Math.abs(data[idx + 2] - b) <= tolerance &&
    Math.abs(data[idx + 3] - a) <= tolerance
  );
}

/** Returns a new ImageData with the flood-filled region. */
function floodFill(args: FloodFillArgs): ImageData {
  const { imageData, startX, startY, fillR, fillG, fillB, fillA, tolerance } = args;
  const { width, height, data } = imageData;
  const result = new ImageData(new Uint8ClampedArray(data), width, height);
  const rd = result.data;

  const startIdx = (startY * width + startX) * 4;
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  // Bail if target color is same as fill
  if (
    Math.abs(sr - fillR) <= tolerance &&
    Math.abs(sg - fillG) <= tolerance &&
    Math.abs(sb - fillB) <= tolerance &&
    Math.abs(sa - fillA) <= tolerance
  ) {
    return result;
  }

  const visited = new Uint8Array(width * height);
  const stack: number[] = [startY * width + startX];

  while (stack.length > 0) {
    const pos = stack.pop()!;
    if (visited[pos]) continue;
    const x = pos % width;
    const y = Math.floor(pos / width);
    const idx = pos * 4;

    if (!colorMatch(rd, idx, sr, sg, sb, sa, tolerance)) continue;

    visited[pos] = 1;
    rd[idx] = fillR;
    rd[idx + 1] = fillG;
    rd[idx + 2] = fillB;
    rd[idx + 3] = fillA;

    if (x > 0) stack.push(pos - 1);
    if (x < width - 1) stack.push(pos + 1);
    if (y > 0) stack.push(pos - width);
    if (y < height - 1) stack.push(pos + width);
  }

  return result;
}

const workerApi = { floodFill };
export type PixelWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
