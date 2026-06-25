import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry, ProjectHandle, RenderableModel } from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { useSettingsStore } from "../../state/settingsStore";
import { BlockStudioViewport } from "./BlockStudioViewport";

vi.mock("../viewer3d/Scene3D", () => ({
  Scene3D: () => <div data-testid="scene3d" />,
}));

vi.mock("./StudioTexturePreview", () => ({
  StudioTexturePreview: () => <div data-testid="studio-texture-preview" />,
}));

vi.mock("../viewer3d/ModelFaceChrome", () => ({
  ModelFaceChrome: () => <nav data-testid="texture-navigator" />,
}));

vi.mock("./StudioAnimationPreview", () => ({
  StudioAnimationPreview: () => null,
}));

vi.mock("./useStudioFaceBootstrap", () => ({
  useStudioFaceBootstrap: vi.fn(),
}));

vi.mock("../viewer3d/viewerTextureSync", () => ({
  applyBiomeChange: vi.fn(),
}));

const handle: ProjectHandle = { id: 1 };

const blockEntry: CatalogEntry = {
  id: "minecraft:stone",
  namespace: "minecraft",
  displayName: "Stone",
  kind: "block",
  sourcePath: "assets/minecraft/blockstates/stone.json",
  resolveKind: "blockstate",
  category: "building",
  searchTokens: [],
  texturePaths: ["assets/minecraft/textures/block/stone.png"],
  iconKey: "minecraft:stone:",
  aliases: [],
  studioModelPath: "assets/minecraft/blockstates/stone.json",
  presentation: "block",
};

const textureEntry: CatalogEntry = {
  ...blockEntry,
  id: "minecraft:textures/block/stone.png",
  displayName: "Stone Texture",
  resolveKind: "texture",
  sourcePath: "assets/minecraft/textures/block/stone.png",
  studioModelPath: "assets/minecraft/textures/block/stone.png",
  presentation: "block",
};

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

describe("BlockStudioViewport", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useSelectionStore.setState({
      selectedFace: null,
      hoveredFace: null,
      interactionMode: "paint",
    });
    useSettingsStore.setState({
      studioShowFloorGrid: false,
    });
  });

  it("renders 3D scene and texture navigator for block models", () => {
    render(
      <BlockStudioViewport
        model={model}
        handle={handle}
        entry={blockEntry}
        variants={[{ key: "", model: "minecraft:block/stone", x: 0, y: 0, z: 0, uvlock: false }]}
        variantKey=""
        onVariantChange={vi.fn()}
        biome="plains"
        onBiomeChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("scene3d")).toBeTruthy();
    expect(screen.getByTestId("texture-navigator")).toBeTruthy();
    expect(screen.getByText("Stone")).toBeTruthy();
  });

  it("shows flat texture preview for texture-only entries", () => {
    render(
      <BlockStudioViewport
        model={null}
        handle={handle}
        entry={textureEntry}
        variants={[]}
        variantKey={undefined}
        onVariantChange={vi.fn()}
        biome="plains"
        onBiomeChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("studio-texture-preview")).toBeTruthy();
    expect(screen.getByText(/Texture-only entry/)).toBeTruthy();
    expect(screen.queryByTestId("scene3d")).toBeNull();
  });

  it("shows resolve error and biome controls", () => {
    const onBiomeChange = vi.fn();
    render(
      <BlockStudioViewport
        model={model}
        handle={handle}
        entry={blockEntry}
        variants={[]}
        variantKey=""
        onVariantChange={vi.fn()}
        biome="plains"
        onBiomeChange={onBiomeChange}
        resolveError="Model missing"
      />,
    );

    expect(screen.getByRole("alert").textContent).toContain("Model missing");
    fireEvent.click(screen.getByRole("button", { name: "plains" }));
    expect(onBiomeChange).toHaveBeenCalledWith("plains");
  });
});
