export type RgbaTuple = [number, number, number, number];

export interface WorkerPixelChange {
  x: number;
  y: number;
  before: RgbaTuple;
  after: RgbaTuple;
}

export interface FloodFillInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
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

/** Flood fill on a mutable RGBA buffer; returns sparse pixel changes only. */
export const MAX_FLOOD_FILL_PIXELS = 4_000_000;

export function floodFillAlgorithm(input: FloodFillInput): WorkerPixelChange[] {
  const {
    data,
    width,
    height,
    startX,
    startY,
    fillR,
    fillG,
    fillB,
    fillA,
    tolerance,
  } = input;

  if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
    return [];
  }

  const startIdx = (startY * width + startX) * 4;
  const sr = data[startIdx];
  const sg = data[startIdx + 1];
  const sb = data[startIdx + 2];
  const sa = data[startIdx + 3];

  if (
    Math.abs(sr - fillR) <= tolerance &&
    Math.abs(sg - fillG) <= tolerance &&
    Math.abs(sb - fillB) <= tolerance &&
    Math.abs(sa - fillA) <= tolerance
  ) {
    return [];
  }

  const changes: WorkerPixelChange[] = [];
  const visited = new Uint8Array(width * height);
  const stack: number[] = [startY * width + startX];
  const after: RgbaTuple = [fillR, fillG, fillB, fillA];

  while (stack.length > 0) {
    if (changes.length >= MAX_FLOOD_FILL_PIXELS) break;
    const pos = stack.pop()!;
    if (visited[pos]) continue;
    const x = pos % width;
    const y = Math.floor(pos / width);
    const idx = pos * 4;

    if (!colorMatch(data, idx, sr, sg, sb, sa, tolerance)) continue;

    visited[pos] = 1;
    const before: RgbaTuple = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    if (
      before[0] !== after[0] ||
      before[1] !== after[1] ||
      before[2] !== after[2] ||
      before[3] !== after[3]
    ) {
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;
      data[idx + 3] = fillA;
      changes.push({ x, y, before, after });
    }

    if (x > 0) stack.push(pos - 1);
    if (x < width - 1) stack.push(pos + 1);
    if (y > 0) stack.push(pos - width);
    if (y < height - 1) stack.push(pos + width);
  }

  return changes;
}

export interface MagicWandInput {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  startX: number;
  startY: number;
  tolerance: number;
}

export function magicWandAlgorithm(
  input: MagicWandInput,
): [number, number, number, number] | null {
  const { data, width, height, startX, startY, tolerance } = input;
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) {
    return null;
  }

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
    if (found && (maxX - minX + 1) * (maxY - minY + 1) >= MAX_FLOOD_FILL_PIXELS) break;
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
