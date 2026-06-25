import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RenderableModel } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useSettingsStore } from "../../state/settingsStore";
import { useClassicModelFaceBootstrap } from "./useClassicModelFaceBootstrap";

vi.mock("../catalog/modelFaceNav", () => ({
  pickPreferredStudioFace: () => ({
    cuboidIndex: 0,
    faceIndex: 0,
    direction: "up",
    texturePath: "assets/minecraft/textures/block/stone.png",
    uv: [0, 0, 16, 16],
    rotation: 0,
    tintindex: 0,
    hitUv: [0.5, 0.5],
    pixel: [8, 8],
  }),
}));

const model: RenderableModel = {
  kind: "block",
  modelId: "minecraft:block/stone",
  cuboids: [],
  textureRefs: {},
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

describe("useClassicModelFaceBootstrap", () => {
  beforeEach(() => {
    useProjectStore.setState({ handle: { id: 1 } });
    useSelectionStore.setState({
      selectedFace: null,
      interactionMode: "orbit",
    });
    useSettingsStore.setState({ rightPanelCollapsed: true });
  });

  it("selects preferred face and paint mode when classic model loads", () => {
    renderHook(() => useClassicModelFaceBootstrap(model, "asset-1"));

    expect(useSelectionStore.getState().interactionMode).toBe("paint");
    expect(useSelectionStore.getState().selectedFace?.texturePath).toContain("stone.png");
    expect(useSettingsStore.getState().rightPanelCollapsed).toBe(false);
  });
});
