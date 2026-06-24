import { createCanvas, loadImage } from "canvas";
import { describe, expect, it } from "vitest";

import { bakeCatalogIconFromPreviewAsync } from "../features/catalog/CatalogIconRenderer";

function makePngBase64(r: number, g: number, b: number, size = 16): string {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);
  return canvas.toBuffer("image/png").toString("base64");
}

/** Simple average-hash fingerprint for stable golden comparisons. */
async function perceptualHash(dataUrl: string, bits = 8): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = createCanvas(bits, bits);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, bits, bits);
  const { data } = ctx.getImageData(0, 0, bits, bits);

  let sum = 0;
  const lumas: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    const luma = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    lumas.push(luma);
    sum += luma;
  }
  const avg = sum / lumas.length;

  let hash = "";
  for (const luma of lumas) {
    hash += luma >= avg ? "1" : "0";
  }
  return hash;
}

describe("catalog icon golden", () => {
  it("renders preview icons with stable perceptual hashes", async () => {
    const red = await bakeCatalogIconFromPreviewAsync(makePngBase64(200, 40, 40), 48);
    const blue = await bakeCatalogIconFromPreviewAsync(makePngBase64(40, 80, 220), 48);

    expect(red.startsWith("data:image/png")).toBe(true);
    expect(blue.startsWith("data:image/png")).toBe(true);

    const redHash = await perceptualHash(red);
    const blueHash = await perceptualHash(blue);

    expect(redHash).toMatchInlineSnapshot(`"0000000000000000000000000000000000000000000000000000000000000000"`);
    expect(blueHash).toMatchInlineSnapshot(`"1111111111111111111111111111111111111111111111111111111111111111"`);
    expect(redHash).not.toBe(blueHash);
  });

  it("scales 16×16 source textures to catalog cell size", async () => {
    const url = await bakeCatalogIconFromPreviewAsync(makePngBase64(128, 128, 128, 16), 48);
    const img = await loadImage(url);
    expect(img.width).toBe(48);
    expect(img.height).toBe(48);
  });
});
