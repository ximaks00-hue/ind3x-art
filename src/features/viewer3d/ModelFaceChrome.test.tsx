import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RenderableModel } from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { ModelFaceChrome } from "./ModelFaceChrome";

vi.mock("../catalog/UnfoldPanel", () => ({
  UnfoldPanel: () => <div data-testid="unfold-panel" />,
}));

vi.mock("../catalog/TextureNavigator", () => ({
  TextureNavigator: () => <nav data-testid="texture-navigator" />,
}));

vi.mock("./useModelFaceHotkeys", () => ({
  useModelFaceHotkeys: vi.fn(),
}));

const model: RenderableModel = {
  kind: "block",
  modelId: "minecraft:block/stone",
  cuboids: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      rotation: null,
      shade: true,
      faces: [
        {
          direction: "up",
          uv: [0, 0, 16, 16],
          texture: "assets/minecraft/textures/block/stone.png",
          rotation: 0,
          tintindex: 0,
          cullface: null,
        },
      ],
    },
  ],
  textureRefs: {},
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: false },
  display: {},
  ambientOcclusion: true,
};

describe("ModelFaceChrome", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useSelectionStore.setState({
      selectedFace: null,
      hoveredFace: null,
      interactionMode: "paint",
    });
  });

  it("renders unfold and texture navigator for any workspace mode", () => {
    const { getByTestId } = render(<ModelFaceChrome model={model} />);
    expect(getByTestId("unfold-panel")).toBeTruthy();
    expect(getByTestId("texture-navigator")).toBeTruthy();
  });
});
