import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle } from "../../ipc/types";

vi.mock("../../ipc/client", () => ({
  ipc: {
    getTextureBinary: vi.fn().mockRejectedValue(new Error("no binary")),
    getTexture: vi.fn(),
  },
}));

vi.mock("../viewer3d/textureLoader", () => ({
  refreshTextureFromCanvas: vi.fn(),
}));

import { ipc } from "../../ipc/client";
import {
  clearTextureDocuments,
  commitChanges,
  ensureTextureDocument,
  getDoc,
  markTexturesSaved,
  getDirtyTexturePaths,
  getPixel,
  isTextureDirty,
} from "./textureDocument";

function make1x1PngBase64(r: number, g: number, b: number, a = 255): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(0, 0, 1, 1);
  return canvas.toDataURL("image/png").split(",")[1]!;
}

const handle: ProjectHandle = { id: 1 };

describe("textureDocument", () => {
  const path = "assets/minecraft/textures/block/test.png";

  beforeEach(() => {
    clearTextureDocuments();
    vi.mocked(ipc.getTexture).mockResolvedValue({
      pngBase64: make1x1PngBase64(255, 0, 0),
      width: 1,
      height: 1,
    });
  });

  it("tracks dirty state after pixel changes", async () => {
    await ensureTextureDocument(handle, path);

    expect(isTextureDirty(path)).toBe(false);
    expect(getDirtyTexturePaths()).toEqual([]);

    const doc = await ensureTextureDocument(handle, path);
    const before = getPixel(path, 0, 0)!;
    commitChanges(handle, path, [
      {
        x: 0,
        y: 0,
        before,
        after: [0, 255, 0, 255],
        layerId: doc.layers[0].id,
      },
    ]);

    expect(isTextureDirty(path)).toBe(true);
    expect(getDirtyTexturePaths()).toContain(path);
    expect(getPixel(path, 0, 0)).toEqual([0, 255, 0, 255]);
  });

  it("undo restores pixel after commit", async () => {
    const { undoTexture, canUndo } = await import("./textureDocument");
    const doc = await ensureTextureDocument(handle, path);
    const before = getPixel(path, 0, 0)!;
    commitChanges(handle, path, [
      {
        x: 0,
        y: 0,
        before,
        after: [0, 255, 0, 255],
        layerId: doc.layers[0].id,
      },
    ]);
    expect(canUndo(path)).toBe(true);
    undoTexture(handle, path);
    expect(getPixel(path, 0, 0)).toEqual(before);
  });

  it("undo back to baseline clears dirty state", async () => {
    const { undoTexture } = await import("./textureDocument");
    const doc = await ensureTextureDocument(handle, path);
    const before = getPixel(path, 0, 0)!;
    commitChanges(handle, path, [
      {
        x: 0,
        y: 0,
        before,
        after: [0, 255, 0, 255],
        layerId: doc.layers[0].id,
      },
    ]);
    expect(isTextureDirty(path)).toBe(true);

    undoTexture(handle, path);
    expect(isTextureDirty(path)).toBe(false);
    expect(getDirtyTexturePaths()).toEqual([]);
  });

  it("deduplicates concurrent ensureTextureDocument calls", async () => {
    clearTextureDocuments();
    vi.mocked(ipc.getTexture).mockClear();
    let resolvePreview!: (value: {
      pngBase64: string;
      width: number;
      height: number;
    }) => void;
    const deferred = new Promise<{ pngBase64: string; width: number; height: number }>(
      (resolve) => {
        resolvePreview = resolve;
      },
    );
    vi.mocked(ipc.getTexture).mockImplementation(() => deferred);

    const first = ensureTextureDocument(handle, path);
    const second = ensureTextureDocument(handle, path);

    resolvePreview({
      pngBase64: make1x1PngBase64(120, 10, 50),
      width: 1,
      height: 1,
    });

    const [docA, docB] = await Promise.all([first, second]);
    expect(docA).toBe(docB);
    expect(vi.mocked(ipc.getTexture)).toHaveBeenCalledTimes(1);
  });

  it("drops stale in-flight load after clearTextureDocuments", async () => {
    let resolvePreview!: (value: {
      pngBase64: string;
      width: number;
      height: number;
    }) => void;
    const deferred = new Promise<{ pngBase64: string; width: number; height: number }>(
      (resolve) => {
        resolvePreview = resolve;
      },
    );
    vi.mocked(ipc.getTexture).mockImplementation(() => deferred);

    const first = ensureTextureDocument(handle, path).catch(() => null);
    clearTextureDocuments();

    resolvePreview({
      pngBase64: make1x1PngBase64(30, 40, 50),
      width: 1,
      height: 1,
    });
    const result = await first;
    expect(result).toBeNull();
    expect(getDoc(path)).toBeUndefined();
  });

  it("keeps dirty when document changed after save snapshot", async () => {
    const doc = await ensureTextureDocument(handle, path);
    const before = getPixel(path, 0, 0)!;
    commitChanges(handle, path, [
      {
        x: 0,
        y: 0,
        before,
        after: [0, 255, 0, 255],
        layerId: doc.layers[0].id,
      },
    ]);

    const snapshot = [{ path, revision: getDoc(path)!.revision }];

    commitChanges(handle, path, [
      {
        x: 0,
        y: 0,
        before: [0, 255, 0, 255],
        after: [0, 0, 255, 255],
        layerId: doc.layers[0].id,
      },
    ]);

    markTexturesSaved([path], [path], snapshot);
    expect(isTextureDirty(path)).toBe(true);
    expect(getPixel(path, 0, 0)).toEqual([0, 0, 255, 255]);
  });
});
