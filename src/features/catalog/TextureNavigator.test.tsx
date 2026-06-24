import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RenderableModel } from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { TextureNavigator } from "./TextureNavigator";

vi.mock("../explorer/TextureThumbnail", () => ({
  TextureThumbnail: ({ assetPath }: { assetPath: string }) => (
    <span data-testid="thumb">{assetPath}</span>
  ),
}));

const model: RenderableModel = {
  kind: "multipart",
  modelId: "minecraft:block/fence_post + minecraft:block/fence_side",
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
          texture: "assets/minecraft/textures/block/fence_post.png",
          rotation: 0,
          tintindex: 0,
          cullface: null,
        },
      ],
    },
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      rotation: null,
      shade: true,
      faces: [
        {
          direction: "north",
          uv: [0, 0, 16, 16],
          texture: "assets/minecraft/textures/block/fence_side.png",
          rotation: 0,
          tintindex: 0,
          cullface: null,
        },
      ],
    },
  ],
  textureRefs: {},
  textureMeta: {},
  modelRotation: { x: 0, y: 0, z: 0, uvlock: true },
  display: {},
  ambientOcclusion: true,
};

describe("TextureNavigator", () => {
  beforeEach(() => {
    useSelectionStore.setState({ selectedFace: null, hoveredFace: null, interactionMode: "orbit" });
  });

  it("renders unique texture chips and selects face on click (UC-2)", () => {
    const onSelectFace = vi.fn();
    render(
      <TextureNavigator model={model} selectedFace={null} onSelectFace={onSelectFace} />,
    );

    expect(screen.getByText(/Fence Post \+ Fence Side/)).toBeTruthy();
    expect(screen.getByTitle(/fence_post/)).toBeTruthy();
    expect(screen.getByTitle(/fence_side/)).toBeTruthy();

    fireEvent.click(screen.getByTitle(/fence_post/));
    expect(onSelectFace).toHaveBeenCalledWith(0, 0);

    fireEvent.click(screen.getByTitle(/fence_side/));
    expect(onSelectFace).toHaveBeenCalledWith(1, 0);
  });
});
