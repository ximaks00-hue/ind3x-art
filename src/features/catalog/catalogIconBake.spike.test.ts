import { beforeEach, describe, expect, it } from "vitest";

import {
  bakeCatalogIconFromPreview,
  bakeCatalogIconFromPreviewAsync,
  bakeCatalogIconsBatch,
} from "./CatalogIconRenderer";

function make1x1PngBase64(r: number, g: number, b: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, 1, 1);
  return canvas.toDataURL("image/png").split(",")[1]!;
}

describe("catalog icon bake spike (Phase 0)", () => {
  let previewBase64: string;

  beforeEach(() => {
    previewBase64 = make1x1PngBase64(200, 40, 40);
  });

  it("bakes a preview icon to data URL", async () => {
    const url = await bakeCatalogIconFromPreviewAsync(previewBase64, 48);
    expect(url.startsWith("data:image/png")).toBe(true);
  });

  it("bakes 100 preview icons in under 5 seconds", async () => {
    const items = Array.from({ length: 100 }, () => ({ pngBase64: previewBase64 }));
    const start = performance.now();
    const urls = await bakeCatalogIconsBatch(items, 48);
    const elapsed = performance.now() - start;

    expect(urls).toHaveLength(100);
    expect(urls.every((u) => u.startsWith("data:image/png"))).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  });

  it("alias bakeCatalogIconFromPreview matches async helper", async () => {
    const a = await bakeCatalogIconFromPreview(previewBase64, 32);
    const b = await bakeCatalogIconFromPreviewAsync(previewBase64, 32);
    expect(a).toBe(b);
  });
});
