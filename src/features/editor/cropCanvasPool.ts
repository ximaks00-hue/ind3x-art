const pool: HTMLCanvasElement[] = [];
const MAX_POOL = 4;

export function acquireCropCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = pool.pop() ?? document.createElement("canvas");
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return canvas;
}

export function releaseCropCanvas(canvas: HTMLCanvasElement): void {
  if (pool.length >= MAX_POOL) {
    canvas.width = 0;
    canvas.height = 0;
    return;
  }
  pool.push(canvas);
}

export function clearCropCanvasPool(): void {
  for (const canvas of pool) {
    canvas.width = 0;
    canvas.height = 0;
  }
  pool.length = 0;
}
