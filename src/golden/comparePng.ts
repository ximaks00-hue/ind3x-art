import { createCanvas, loadImage } from "canvas";

export interface PngDiffResult {
  diffRatio: number;
  width: number;
  height: number;
  mismatchedPixels: number;
}

/** Compare two PNG buffers; returns ratio of differing pixels (0–1). */
export async function comparePngBuffers(
  actual: Buffer,
  expected: Buffer,
  tolerance = 0,
): Promise<PngDiffResult> {
  const [aImg, eImg] = await Promise.all([loadImage(actual), loadImage(expected)]);
  const width = Math.max(aImg.width, eImg.width);
  const height = Math.max(aImg.height, eImg.height);

  const aCanvas = createCanvas(width, height);
  const eCanvas = createCanvas(width, height);
  const aCtx = aCanvas.getContext("2d");
  const eCtx = eCanvas.getContext("2d");
  aCtx.drawImage(aImg, 0, 0);
  eCtx.drawImage(eImg, 0, 0);

  const aData = aCtx.getImageData(0, 0, width, height).data;
  const eData = eCtx.getImageData(0, 0, width, height).data;

  let mismatched = 0;
  const total = width * height;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    const dr = Math.abs(aData[o] - eData[o]);
    const dg = Math.abs(aData[o + 1] - eData[o + 1]);
    const db = Math.abs(aData[o + 2] - eData[o + 2]);
    const da = Math.abs(aData[o + 3] - eData[o + 3]);
    if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) {
      mismatched += 1;
    }
  }

  return {
    diffRatio: mismatched / total,
    width,
    height,
    mismatchedPixels: mismatched,
  };
}

export function canvasToPngBuffer(canvas: HTMLCanvasElement): Buffer {
  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1] ?? "";
  return Buffer.from(base64, "base64");
}
