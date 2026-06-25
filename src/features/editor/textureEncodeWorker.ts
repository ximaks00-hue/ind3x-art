/**
 * Web Worker for PNG → base64 encoding (keeps main thread responsive during saves).
 */
import * as Comlink from "comlink";

function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const slice = bytes.subarray(i, i + chunk);
    for (let j = 0; j < slice.length; j++) {
      binary += String.fromCharCode(slice[j]!);
    }
  }
  return btoa(binary);
}

async function canvasPixelsToPngBase64(
  width: number,
  height: number,
  pixels: Uint8ClampedArray,
): Promise<string> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("failed to create offscreen canvas context");
  }
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: "image/png" });
  return uint8ToBase64(new Uint8Array(await blob.arrayBuffer()));
}

export type TextureEncodeWorkerApi = {
  canvasPixelsToPngBase64: typeof canvasPixelsToPngBase64;
};

Comlink.expose({ canvasPixelsToPngBase64 } satisfies TextureEncodeWorkerApi);
