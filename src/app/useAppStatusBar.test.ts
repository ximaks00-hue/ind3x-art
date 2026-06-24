import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle } from "../ipc/types";
import {
  clearTextureDocuments,
  commitChanges,
  ensureTextureDocument,
  getPixel,
  isTextureDirty,
  markTexturesSaved,
} from "../features/editor/textureDocument";
import { useCatalogStore } from "../features/catalog/catalogStore";
import { useProjectStore } from "../state/projectStore";
import { useSelectionStore } from "../state/selectionStore";
import { useSettingsStore } from "../state/settingsStore";
import { useAppStatusBar } from "./useAppStatusBar";

vi.mock("../ipc/client", () => ({
  ipc: {
    getTextureBinary: vi.fn().mockRejectedValue(new Error("no binary")),
    getTexture: vi.fn(),
  },
}));

vi.mock("../features/viewer3d/textureLoader", () => ({
  refreshTextureFromCanvas: vi.fn(),
}));

import { ipc } from "../ipc/client";

const TEXTURE_PATH = "assets/minecraft/textures/block/test_stone.png";
const HANDLE: ProjectHandle = { id: 1 };

function make1x1PngBase64(r: number, g: number, b: number, a = 255): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
  ctx.fillRect(0, 0, 1, 1);
  return canvas.toDataURL("image/png").split(",")[1]!;
}

describe("useAppStatusBar", () => {
  beforeEach(() => {
    clearTextureDocuments();
    vi.mocked(ipc.getTexture).mockResolvedValue({
      pngBase64: make1x1PngBase64(255, 0, 0),
      width: 16,
      height: 16,
    });
    useProjectStore.setState({
      handle: HANDLE,
      indexStatus: "done",
      queryTotal: 10,
    } as Partial<ReturnType<typeof useProjectStore.getState>>);
    useSettingsStore.setState({ workspaceMode: "studio" });
    useCatalogStore.getState().reset();
    useCatalogStore.getState().selectEntry({
      id: "minecraft:stone",
      namespace: "minecraft",
      displayName: "Stone",
      kind: "block",
      sourcePath: "assets/minecraft/blockstates/stone.json",
      resolveKind: "blockstate",
      category: "building",
      searchTokens: [],
      texturePaths: [TEXTURE_PATH],
      iconKey: "minecraft:stone:",
      aliases: [],
      studioModelPath: "assets/minecraft/blockstates/stone.json",
      presentation: "block",
    });
    useSelectionStore.setState({
      selectedFace: {
        texturePath: TEXTURE_PATH,
        direction: "north",
        uv: [0, 0, 16, 16],
        rotation: 0,
        tintindex: 0,
      },
    });
  });

  it("clears studio textureDirty after save commits document state", async () => {
    const doc = await ensureTextureDocument(HANDLE, TEXTURE_PATH);
    const before = getPixel(TEXTURE_PATH, 0, 0)!;
    commitChanges(HANDLE, TEXTURE_PATH, [
      {
        x: 0,
        y: 0,
        before,
        after: [0, 255, 0, 255],
        layerId: doc.layers[0].id,
      },
    ]);

    const { result, rerender } = renderHook(() => useAppStatusBar());
    expect(result.current.studioStatus?.textureDirty).toBe(true);

    markTexturesSaved([TEXTURE_PATH], [TEXTURE_PATH], [
      { path: TEXTURE_PATH, revision: doc.revision },
    ]);
    rerender();

    expect(isTextureDirty(TEXTURE_PATH)).toBe(false);
    expect(result.current.studioStatus?.textureDirty).toBe(false);
  });
});
