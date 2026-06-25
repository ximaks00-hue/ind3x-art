import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PixelChange } from "./textureDocument";

vi.mock("comlink", () => ({
  transfer: vi.fn((value: unknown) => value),
}));

vi.mock("./textureDocument", () => ({
  commitChanges: vi.fn(),
  getActiveLayerCanvas: vi.fn(),
  getActiveLayerId: vi.fn(),
}));

vi.mock("./tools", () => ({
  floodFillChanges: vi.fn(() => []),
  hexToRgba: vi.fn(() => [255, 0, 0, 255]),
  magicWandSelection: vi.fn(() => null),
}));

vi.mock("../../lib/asyncWithProgress", () => ({
  withProgressToast: (_label: string, fn: () => Promise<void>) => fn(),
}));

import * as Comlink from "comlink";
import {
  applyFillAtPixel,
  applyWandAtPixel,
  workerChangesToPixelChanges,
} from "./paintWorkerOps";
import {
  commitChanges,
  getActiveLayerCanvas,
  getActiveLayerId,
} from "./textureDocument";
import { floodFillChanges, magicWandSelection } from "./tools";

const handle = { id: 1 };

describe("paintWorkerOps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps worker pixel changes onto the active layer", () => {
    const mapped = workerChangesToPixelChanges(
      [{ x: 1, y: 2, before: [0, 0, 0, 0], after: [1, 2, 3, 255] }],
      "layer-a",
    );
    expect(mapped).toEqual<PixelChange[]>([
      { x: 1, y: 2, before: [0, 0, 0, 0], after: [1, 2, 3, 255], layerId: "layer-a" },
    ]);
  });

  it("applyFillAtPixel commits sparse worker changes with Comlink.transfer", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 2, 2);

    vi.mocked(getActiveLayerCanvas).mockReturnValue(canvas);
    vi.mocked(getActiveLayerId).mockReturnValue("layer-a");

    const worker = {
      floodFill: vi.fn().mockResolvedValue([
        { x: 0, y: 0, before: [255, 0, 0, 255], after: [0, 255, 0, 255] },
      ]),
    };

    await applyFillAtPixel(
      {
        handle,
        texturePath: "tex.png",
        tool: "fill",
        color: "#00ff00",
        fillTolerance: 0,
        symmetryX: false,
        symmetryY: false,
        brushSize: 1,
        brushOpacity: 1,
      },
      0,
      0,
      worker as never,
    );

    expect(Comlink.transfer).toHaveBeenCalled();
    expect(worker.floodFill).toHaveBeenCalled();
    expect(commitChanges).toHaveBeenCalledWith(
      handle,
      "tex.png",
      [{ x: 0, y: 0, before: [255, 0, 0, 255], after: [0, 255, 0, 255], layerId: "layer-a" }],
      true,
      "Fill",
      true,
    );
    expect(floodFillChanges).not.toHaveBeenCalled();
  });

  it("applyFillAtPixel falls back to sync flood fill when worker throws", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    vi.mocked(getActiveLayerCanvas).mockReturnValue(canvas);
    vi.mocked(floodFillChanges).mockReturnValue([
      { x: 0, y: 0, before: [0, 0, 0, 0], after: [1, 1, 1, 255], layerId: "layer-a" },
    ]);

    const worker = { floodFill: vi.fn().mockRejectedValue(new Error("worker down")) };
    const onComplete = vi.fn();

    await applyFillAtPixel(
      {
        handle,
        texturePath: "tex.png",
        tool: "fill",
        color: "#ffffff",
        fillTolerance: 0,
        symmetryX: false,
        symmetryY: false,
        brushSize: 1,
        brushOpacity: 1,
      },
      0,
      0,
      worker as never,
      onComplete,
    );

    expect(floodFillChanges).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it("applyWandAtPixel uses worker selection when available", async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    vi.mocked(getActiveLayerCanvas).mockReturnValue(canvas);

    const worker = {
      magicWand: vi.fn().mockResolvedValue([0, 0, 1, 1] as [number, number, number, number]),
    };
    const onSelection = vi.fn();

    await applyWandAtPixel(
      {
        handle,
        texturePath: "tex.png",
        tool: "wand",
        color: "#fff",
        fillTolerance: 10,
        symmetryX: false,
        symmetryY: false,
        brushSize: 1,
        brushOpacity: 1,
      },
      0,
      0,
      worker as never,
      onSelection,
    );

    expect(Comlink.transfer).toHaveBeenCalled();
    expect(onSelection).toHaveBeenCalledWith([0, 0, 1, 1]);
    expect(magicWandSelection).not.toHaveBeenCalled();
  });
});
