import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle } from "../../ipc/types";
import { mockTexturePreview } from "../../test/paintTestDoc";
import { buildPaintStrokeContext, paintAtTexturePixel } from "./paintInteraction";
import { clearTextureDocuments, getPixel } from "./textureDocument";

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

describe("paintInteraction fill/wand", () => {
  beforeEach(async () => {
    clearTextureDocuments();
    const { ipc } = await import("../../ipc/client");
    vi.mocked(ipc.getTexture).mockResolvedValue(
      mockTexturePreview(16, 16, [200, 200, 200, 255]),
    );
    const { ensureTextureDocument } = await import("./textureDocument");
    await ensureTextureDocument(handle, texturePath);
  });

  it("fill updates pixels via sync path (no worker)", async () => {
    const { useEditorStore } = await import("../../state/editorStore");
    useEditorStore.setState({ tool: "fill", color: "#ff0000", fillTolerance: 0 });

    const ctx = buildPaintStrokeContext(handle, texturePath);
    const before = getPixel(texturePath, 0, 0);
    await paintAtTexturePixel(ctx, 0, 0, false, null, { pixelWorker: null });
    const after = getPixel(texturePath, 0, 0);

    expect(before).toEqual([200, 200, 200, 255]);
    expect(after).toEqual([255, 0, 0, 255]);
  });

  it("wand selects region via sync path", async () => {
    const { useEditorStore } = await import("../../state/editorStore");
    useEditorStore.setState({ tool: "wand", fillTolerance: 0 });

    const ctx = buildPaintStrokeContext(handle, texturePath);
    let selection: [number, number, number, number] | null = null;
    await paintAtTexturePixel(ctx, 0, 0, false, null, {
      pixelWorker: null,
      callbacks: {
        onWandSelection: (sel) => {
          selection = sel;
        },
      },
    });

    expect(selection).toEqual([0, 0, 15, 15]);
  });
});
