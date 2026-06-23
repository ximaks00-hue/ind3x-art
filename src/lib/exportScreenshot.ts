export function exportViewerScreenshot(filename = "ind3x-preview.png"): boolean {
  const canvas = document.querySelector<HTMLCanvasElement>(
    '[data-viewer-canvas="true"] canvas',
  );
  if (!canvas) return false;

  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
  return true;
}
