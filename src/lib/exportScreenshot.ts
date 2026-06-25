export type ScreenshotFormat = "png" | "jpeg";

export interface ScreenshotExportOptions {
  format: ScreenshotFormat;
  /** 0.1 – 1.0, JPEG only */
  quality: number;
  transparentBackground: boolean;
  filename?: string;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export async function exportViewerScreenshot(
  options: ScreenshotExportOptions = {
    format: "png",
    quality: 0.92,
    transparentBackground: false,
  },
): Promise<boolean> {
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

  const blob = await new Promise<Blob | null>((resolve) => {
    exportCanvas.toBlob(
      (result) => resolve(result),
      mime,
      options.format === "jpeg" ? options.quality : undefined,
    );
  });

  if (!blob) return false;
  triggerDownload(blob, filename);
  return true;
}
