import type { TexturePreview } from "../ipc/types";

export function rgbaCanvasBase64(
  width: number,
  height: number,
  fill: [number, number, number, number],
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const [r, g, b, a] = fill;
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL("image/png").split(",")[1]!;
}

export function mockTexturePreview(
  width: number,
  height: number,
  fill: [number, number, number, number] = [128, 128, 128, 255],
): TexturePreview {
  return {
    pngBase64: rgbaCanvasBase64(width, height, fill),
    width,
    height,
  };
}
