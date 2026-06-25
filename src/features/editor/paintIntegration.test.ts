import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle, RenderFace } from "../../ipc/types";
import { ipc } from "../../ipc/client";
import { mockTexturePreview } from "../../test/paintTestDoc";
import { hitUvToPixel } from "../viewer3d/uvMapping";
import { applyBrushAt } from "./paintEngine";
import {
  canUndo,
  clearTextureDocuments,
  getPixel,
  peekUndoLabel,
  undoTexture,
} from "./textureDocument";

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
const texturePath = "assets/minecraft/textures/block/test_stone.png";

const northFace: RenderFace = {
  direction: "north",
  texture: texturePath,
  uv: [0, 0, 16, 16],
  rotation: 0,
  tintindex: 0,
  cullface: null,
};

describe("paint integration", () => {
  beforeEach(async () => {
    clearTextureDocuments();
    vi.mocked(ipc.getTexture).mockResolvedValue(
      mockTexturePreview(16, 16, [200, 200, 200, 255]),
    );
    const { ensureTextureDocument } = await import("./textureDocument");
    await ensureTextureDocument(handle, texturePath);
  });

  it("maps face UV hit to pixel coordinates", () => {
    const [px, py] = hitUvToPixel(0.25, 0.75, northFace);
    expect(px).toBeGreaterThanOrEqual(0);
    expect(px).toBeLessThan(16);
    expect(py).toBeGreaterThanOrEqual(0);
    expect(py).toBeLessThan(16);
  });

  it("face pick → paint pixel → undo restores original", () => {
    const [px, py] = hitUvToPixel(0.5, 0.5, northFace);
    const before = getPixel(texturePath, px, py)!;

    applyBrushAt(
      handle,
      {
        handle,
        texturePath,
        tool: "pencil",
        color: "#336699",
        symmetryX: false,
        symmetryY: false,
        brushSize: 1,
        brushOpacity: 1,
      },
      px,
      py,
      false,
      null,
    );

    expect(getPixel(texturePath, px, py)).not.toEqual(before);
    expect(canUndo(texturePath)).toBe(true);
    expect(peekUndoLabel(texturePath)).toContain("Pencil");

    const undone = undoTexture(handle, texturePath);
    expect(undone).toBe(true);
    expect(getPixel(texturePath, px, py)).toEqual(before);
    expect(canUndo(texturePath)).toBe(false);
  });

  it("symmetry paint creates mirrored undo entry", () => {
    applyBrushAt(
      handle,
      {
        handle,
        texturePath,
        tool: "pencil",
        color: "#ff0000",
        symmetryX: true,
        symmetryY: false,
        brushSize: 1,
        brushOpacity: 1,
      },
      2,
      4,
      false,
      null,
    );

    expect(getPixel(texturePath, 2, 4)).toEqual([255, 0, 0, 255]);
    expect(getPixel(texturePath, 13, 4)).toEqual([255, 0, 0, 255]);

    undoTexture(handle, texturePath);
    expect(getPixel(texturePath, 2, 4)).toEqual([200, 200, 200, 255]);
    expect(getPixel(texturePath, 13, 4)).toEqual([200, 200, 200, 255]);
  });
});
