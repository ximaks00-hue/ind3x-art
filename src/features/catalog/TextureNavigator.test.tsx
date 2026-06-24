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
  modelId: "minecraft:test_fence",
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
    useSelectionStore.setState({ selectedFace: null, interactionMode: "orbit" });
  });

  it("renders multipart groups and selects face on click (UC-2)", () => {
    const onSelectFace = vi.fn();
    render(
      <TextureNavigator
        model={model}
        selectedFace={null}
        onSelectFace={onSelectFace}
      />,
    );

    expect(screen.getByText("Part 1")).toBeTruthy();
    expect(screen.getByText("Part 2")).toBeTruthy();

    fireEvent.click(screen.getByTitle("Top · fence_post"));
    expect(onSelectFace).toHaveBeenCalledWith(0, 0);

    fireEvent.click(screen.getByTitle("North · fence_side"));
    expect(onSelectFace).toHaveBeenCalledWith(1, 0);
  });
});
