import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle } from "../../ipc/types";
import { ipc } from "../../ipc/client";
import { mockTexturePreview } from "../../test/paintTestDoc";
import { MAX_UNDO_ENTRIES } from "./textureDocumentCore";
import {
  applyBrushChanges,
  beginBrushStroke,
  endBrushStroke,
} from "./paintStrokeCommit";
import { workerChangesToPixelChanges } from "./paintWorkerOps";
import {
  clearTextureDocuments,
  commitChanges,
  getActiveLayerId,
  getDoc,
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
const path = "assets/minecraft/textures/block/regression.png";

async function loadDoc() {
  vi.mocked(ipc.getTexture).mockResolvedValue(mockTexturePreview(8, 8, [64, 64, 64, 255]));
  const { ensureTextureDocument } = await import("./textureDocument");
  return ensureTextureDocument(handle, path);
}

describe("paint regressions", () => {
  beforeEach(async () => {
    clearTextureDocuments();
    await loadDoc();
  });

  it("caps undo stack growth", async () => {
    const doc = getDoc(path)!;
    const layerId = doc.layers[0].id;
    for (let i = 0; i < MAX_UNDO_ENTRIES + 5; i++) {
      commitChanges(
        handle,
        path,
        [
          {
            x: i % 8,
            y: 0,
            before: [64, 64, 64, 255],
            after: [i % 255, 0, 0, 255],
            layerId,
          },
        ],
        true,
        `edit-${i}`,
      );
    }
    expect(doc.undo.length).toBeLessThanOrEqual(MAX_UNDO_ENTRIES);
  });

  it("batches brush stroke into a single undo entry", () => {
    const layerId = getActiveLayerId(path)!;
    beginBrushStroke(path);
    applyBrushChanges(handle, path, [
      { x: 1, y: 1, before: [64, 64, 64, 255], after: [1, 0, 0, 255], layerId },
    ], "Pencil stroke");
    applyBrushChanges(handle, path, [
      { x: 2, y: 1, before: [64, 64, 64, 255], after: [2, 0, 0, 255], layerId },
    ], "Pencil stroke");
    expect(getDoc(path)!.undo).toHaveLength(0);
    endBrushStroke(handle, path, "Pencil stroke");
    expect(getDoc(path)!.undo).toHaveLength(1);
    expect(getDoc(path)!.undo[0]?.changes).toHaveLength(2);
  });

  it("pins worker fill changes to the layer captured at commit time", () => {
    const mapped = workerChangesToPixelChanges(
      [{ x: 0, y: 0, before: [1, 2, 3, 4], after: [5, 6, 7, 8] }],
      "layer-at-start",
    );
    expect(mapped[0]?.layerId).toBe("layer-at-start");
  });
});
