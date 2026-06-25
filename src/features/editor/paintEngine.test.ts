import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle } from "../../ipc/types";
import { ipc } from "../../ipc/client";
import { mockTexturePreview } from "../../test/paintTestDoc";
import {
  applyBrushAt,
  commitShapeAt,
  pickAtPixel,
  type PaintStrokeContext,
} from "./paintEngine";
import {
  clearTextureDocuments,
  commitChanges,
  getPixel,
  getTextureCanvas,
} from "./textureDocument";
import {
  collectStrokeChanges,
  ellipseToolChanges,
  floodFillChanges,
  lineToolChanges,
  pixelPerfectFilter,
  rectToolChanges,
} from "./tools";

vi.mock("../../ipc/client", () => ({
  ipc: {
    getTextureBinary: vi.fn().mockRejectedValue(new Error("no binary")),
    getTexture: vi.fn(),
  },
}));

vi.mock("../viewer3d/textureLoader", () => ({
  refreshTextureFromCanvas: vi.fn(),
  releaseCanvasElement: vi.fn(),
  disposeViewerTexture: vi.fn(),
}));

const handle: ProjectHandle = { id: 1 };
const path = "assets/minecraft/textures/block/paint_test.png";

async function loadDoc(
  width = 16,
  height = 16,
  fill: [number, number, number, number] = [64, 64, 64, 255],
) {
  vi.mocked(ipc.getTexture).mockResolvedValue(mockTexturePreview(width, height, fill));
  const { ensureTextureDocument } = await import("./textureDocument");
  return ensureTextureDocument(handle, path);
}

function baseCtx(overrides: Partial<PaintStrokeContext> = {}): PaintStrokeContext {
  return {
    handle,
    texturePath: path,
    tool: "pencil",
    color: "#00ff00",
    symmetryX: false,
    symmetryY: false,
    brushSize: 1,
    brushOpacity: 1,
    brushMode: "normal",
    ...overrides,
  };
}

describe("paintEngine tools", () => {
  beforeEach(async () => {
    clearTextureDocuments();
    await loadDoc(16, 16, [64, 64, 64, 255]);
  });

  it("pencil paints a single pixel", () => {
    const changes = collectStrokeChanges(path, [[4, 4]], "pencil", "#ff0000");
    expect(changes).toHaveLength(1);
    commitChanges(handle, path, changes, true, "Pencil stroke");
    expect(getPixel(path, 4, 4)).toEqual([255, 0, 0, 255]);
  });

  it("eraser clears alpha", () => {
    const changes = collectStrokeChanges(path, [[2, 2]], "eraser", "#000000");
    commitChanges(handle, path, changes);
    expect(getPixel(path, 2, 2)?.[3]).toBe(0);
  });

  it("fill floods connected region", () => {
    const changes = floodFillChanges(path, 0, 0, "#0000ff");
    expect(changes.length).toBe(16 * 16);
    commitChanges(handle, path, changes, true, "Fill");
    expect(getPixel(path, 15, 15)).toEqual([0, 0, 255, 255]);
  });

  it("fill respects tolerance on near colors", async () => {
    const { ensureTextureDocument } = await import("./textureDocument");
    clearTextureDocuments();
    vi.mocked(ipc.getTexture).mockResolvedValue(
      mockTexturePreview(4, 4, [100, 100, 100, 255]),
    );
    await ensureTextureDocument(handle, path);
    commitChanges(
      handle,
      path,
      collectStrokeChanges(path, [[1, 0]], "pencil", "#6e6e6e"),
    );
    const strict = floodFillChanges(path, 0, 0, "#ff0000", 0);
    const loose = floodFillChanges(path, 0, 0, "#ff0000", 40);
    expect(strict.length).toBeLessThan(loose.length);
  });

  it("wand is not in paintEngine but fill works on uniform area", () => {
    const changes = floodFillChanges(path, 8, 8, "#ffffff");
    expect(changes.length).toBeGreaterThan(0);
  });

  it("line tool spans endpoints", () => {
    const changes = lineToolChanges(path, 0, 0, 5, 0, "pencil", "#ff00ff");
    expect(changes.length).toBeGreaterThanOrEqual(6);
    commitChanges(handle, path, changes);
    expect(getPixel(path, 5, 0)).toEqual([255, 0, 255, 255]);
  });

  it("rectangle outline draws border", () => {
    const changes = rectToolChanges(path, 2, 2, 5, 5, "pencil", "#ffff00", false);
    commitChanges(handle, path, changes);
    expect(getPixel(path, 2, 2)).toEqual([255, 255, 0, 255]);
    expect(getPixel(path, 3, 3)).toEqual([64, 64, 64, 255]);
  });

  it("filled rectangle paints interior", () => {
    const changes = rectToolChanges(path, 1, 1, 3, 3, "pencil", "#00ffff", true);
    commitChanges(handle, path, changes);
    expect(getPixel(path, 2, 2)).toEqual([0, 255, 255, 255]);
  });

  it("ellipse tool paints pixels", () => {
    const changes = ellipseToolChanges(path, 4, 4, 10, 8, "#ff8800", true, false);
    expect(changes.length).toBeGreaterThan(4);
    commitChanges(handle, path, changes);
    expect(getPixel(path, 7, 6)).toEqual([255, 136, 0, 255]);
  });

  it("lighten and darken adjust brightness", () => {
    const lighten = collectStrokeChanges(path, [[1, 1]], "lighten", "#ffffff");
    const darken = collectStrokeChanges(path, [[2, 2]], "darken", "#000000");
    commitChanges(handle, path, lighten);
    commitChanges(handle, path, darken);
    expect(getPixel(path, 1, 1)![0]).toBeGreaterThan(64);
    expect(getPixel(path, 2, 2)![0]).toBeLessThan(64);
  });

  it("dither leaves some pixels unchanged", () => {
    const changes = collectStrokeChanges(
      path,
      [
        [3, 3],
        [4, 3],
        [3, 4],
        [4, 4],
      ],
      "dither",
      "#ff0000",
    );
    commitChanges(handle, path, changes);
    const painted = getPixel(path, 3, 3);
    const skipped = getPixel(path, 4, 3);
    expect(painted).toEqual([255, 0, 0, 255]);
    expect(skipped).toEqual([64, 64, 64, 255]);
  });

  it("symmetry X mirrors stroke", () => {
    const changes = collectStrokeChanges(
      path,
      [[2, 4]],
      "pencil",
      "#ff0000",
      true,
      false,
    );
    expect(changes.length).toBe(2);
    commitChanges(handle, path, changes);
    expect(getPixel(path, 2, 4)).toEqual([255, 0, 0, 255]);
    expect(getPixel(path, 13, 4)).toEqual([255, 0, 0, 255]);
  });

  it("symmetry Y mirrors stroke", () => {
    const changes = collectStrokeChanges(
      path,
      [[4, 2]],
      "pencil",
      "#00ff00",
      false,
      true,
    );
    commitChanges(handle, path, changes);
    expect(getPixel(path, 4, 2)).toEqual([0, 255, 0, 255]);
    expect(getPixel(path, 4, 13)).toEqual([0, 255, 0, 255]);
  });

  it("brush size expands footprint", () => {
    const changes = collectStrokeChanges(
      path,
      [[8, 8]],
      "pencil",
      "#ff0000",
      false,
      false,
      3,
    );
    expect(changes.length).toBeGreaterThan(1);
  });

  it("brush opacity blends color", () => {
    const changes = collectStrokeChanges(
      path,
      [[5, 5]],
      "pencil",
      "#ff0000",
      false,
      false,
      1,
      0.5,
    );
    commitChanges(handle, path, changes);
    const px = getPixel(path, 5, 5)!;
    expect(px[0]).toBeGreaterThan(64);
    expect(px[0]).toBeLessThan(255);
  });

  it("pixelPerfectFilter removes diagonal elbows", () => {
    const pts: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    const filtered = pixelPerfectFilter(pts);
    expect(filtered).toEqual([
      [0, 0],
      [3, 3],
    ]);
  });

  it("pickAtPixel returns hex color", () => {
    commitChanges(
      handle,
      path,
      collectStrokeChanges(path, [[0, 0]], "pencil", "#aabbcc"),
    );
    expect(pickAtPixel(path, 0, 0)).toBe("#aabbcc");
  });
});

describe("paintEngine orchestration", () => {
  beforeEach(async () => {
    clearTextureDocuments();
    await loadDoc(8, 8);
  });

  it("applyBrushAt commits stroke", () => {
    applyBrushAt(handle, baseCtx(), 3, 3, false, null);
    expect(getPixel(path, 3, 3)).toEqual([0, 255, 0, 255]);
  });

  it("commitShapeAt draws line between points", () => {
    commitShapeAt(handle, baseCtx({ tool: "line" }), { x: 0, y: 0 }, { x: 4, y: 0 });
    expect(getPixel(path, 4, 0)).toEqual([0, 255, 0, 255]);
  });

  it("composite canvas matches pixel edits", () => {
    applyBrushAt(handle, baseCtx(), 1, 1, false, null);
    const canvas = getTextureCanvas(path);
    expect(canvas).not.toBeNull();
    const ctx = canvas!.getContext("2d")!;
    const data = ctx.getImageData(1, 1, 1, 1).data;
    expect(data[1]).toBe(255);
  });
});
