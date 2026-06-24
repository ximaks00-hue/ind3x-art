import { describe, expect, it } from "vitest";

import { drawShapePreview, isShapeToolName } from "./shapePreviewDraw";

const region = { x: 0, y: 0, width: 16, height: 16 };

describe("shapePreviewDraw", () => {
  it("recognizes shape tools", () => {
    expect(isShapeToolName("line")).toBe(true);
    expect(isShapeToolName("rect")).toBe(true);
    expect(isShapeToolName("ellipse")).toBe(true);
    expect(isShapeToolName("pencil")).toBe(false);
  });

  it("draws line preview pixels", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, 16, 16);

    drawShapePreview(ctx, "line", "#ff0000", false, [0, 0], [8, 8], region, 16, 16);

    const data = ctx.getImageData(0, 0, 16, 16).data;
    const hasRed = Array.from({ length: data.length / 4 }, (_, i) => i * 4).some(
      (i) => data[i] > 200 && data[i + 1] < 50,
    );
    expect(hasRed).toBe(true);
  });

  it("draws rect preview with fill", () => {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d")!;

    drawShapePreview(ctx, "rect", "#00ff00", true, [2, 2], [10, 10], region, 16, 16);

    const px = ctx.getImageData(5, 5, 1, 1).data;
    expect(px[1]).toBeGreaterThan(100);
  });
});
