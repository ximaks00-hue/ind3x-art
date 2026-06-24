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

export interface MagicWandArgs {
  imageData: ImageData;
  startX: number;
  startY: number;
  tolerance: number;
}

function magicWand(args: MagicWandArgs): [number, number, number, number] | null {
  const { imageData, startX, startY, tolerance } = args;
  const { width, height, data } = imageData;
  const idx = (x: number, y: number) => (y * width + x) * 4;
  const si = idx(startX, startY);
  const sr = data[si];
  const sg = data[si + 1];
  const sb = data[si + 2];
  const sa = data[si + 3];

  const matches = (x: number, y: number): boolean => {
    const i = idx(x, y);
    return (
      Math.abs(data[i] - sr) <= tolerance &&
      Math.abs(data[i + 1] - sg) <= tolerance &&
      Math.abs(data[i + 2] - sb) <= tolerance &&
      Math.abs(data[i + 3] - sa) <= tolerance
    );
  };

  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;
  let found = false;
  const stack: [number, number][] = [[startX, startY]];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const vi = y * width + x;
    if (visited[vi]) continue;
    if (!matches(x, y)) continue;
    visited[vi] = 1;
    found = true;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  return found ? [minX, minY, maxX, maxY] : null;
}

const workerApi = { floodFill, magicWand };
export type PixelWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
