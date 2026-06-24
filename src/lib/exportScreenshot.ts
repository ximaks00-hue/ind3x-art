export type ScreenshotFormat = "png" | "jpeg";

export interface ScreenshotExportOptions {
  format: ScreenshotFormat;
  /** 0.1 – 1.0, JPEG only */
  quality: number;
  transparentBackground: boolean;
  filename?: string;
}

export function exportViewerScreenshot(
  options: ScreenshotExportOptions = {
    format: "png",
    quality: 0.92,
    transparentBackground: false,
  },
): boolean {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-viewer-canvas="true"] canvas',
  );
  if (!canvas) return false;

  let exportCanvas = canvas;
  if (options.transparentBackground && options.format === "png") {
    exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return false;
    ctx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(canvas, 0, 0);
  }

  const mime = options.format === "jpeg" ? "image/jpeg" : "image/png";
  const ext = options.format === "jpeg" ? "jpg" : "png";
  const filename = options.filename ?? `ind3x-preview.${ext}`;
  const dataUrl =
    options.format === "jpeg"
      ? exportCanvas.toDataURL(mime, options.quality)
      : exportCanvas.toDataURL(mime);

  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
  return true;
}
