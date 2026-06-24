import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry } from "../../ipc/types";
import {
  clearTextureDocuments,
  commitChanges,
  ensureTextureDocument,
  getPixel,
} from "../editor/documentStore";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { CatalogCell } from "./CatalogCell";

vi.mock("./CatalogIcon", () => ({
  CatalogIcon: ({ fallbackInitial }: { fallbackInitial: string }) => (
    <span data-testid="catalog-icon">{fallbackInitial}</span>
  ),
}));

vi.mock("./CatalogCellCompare", () => ({
  CatalogCellCompare: () => null,
}));

vi.mock("./useCatalogIconPipeline", () => ({
  useCatalogIconStatus: () => ({ src: null, status: "idle", error: null }),
}));

vi.mock("../../ipc/client", () => ({
  ipc: {
    getTextureBinary: vi.fn().mockRejectedValue(new Error("no binary")),
    getTexture: vi.fn().mockResolvedValue({
      pngBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      width: 1,
      height: 1,
    }),
    invalidateCatalogIconsForTextures: vi.fn().mockResolvedValue([]),
  },
}));

const entry: CatalogEntry = {
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

describe("CatalogCell", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    clearTextureDocuments();
    useProjectStore.setState({ handle: { id: 1 } } as Partial<
      ReturnType<typeof useProjectStore.getState>
    >);
    useSettingsStore.setState({
      catalogShowCellLabels: true,
      catalogIconMode: "auto",
      catalogIconCacheLimit: 256,
      textureCacheLimit: 256,
    });
  });

  it("renders gridcell with label and handles click", () => {
    const onClick = vi.fn();
    render(
      <CatalogCell
        entry={entry}
        selected={false}
        focused={false}
        onClick={onClick}
      />,
    );

    expect(screen.getByRole("gridcell", { name: "Stone" })).toBeTruthy();
    expect(screen.getByText("Stone")).toBeTruthy();
    fireEvent.click(screen.getByRole("gridcell"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("activates on Enter key", () => {
    const onClick = vi.fn();
    render(
      <CatalogCell entry={entry} selected={false} focused onClick={onClick} />,
    );

    fireEvent.keyDown(screen.getByRole("gridcell"), { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("shows dirty badge when linked texture is unsaved", async () => {
    const path = entry.texturePaths[0]!;
    await ensureTextureDocument({ id: 1 }, path);
    const doc = await ensureTextureDocument({ id: 1 }, path);
    const before = getPixel(path, 0, 0)!;
    commitChanges({ id: 1 }, path, [
      {
        x: 0,
        y: 0,
        before,
        after: [0, 255, 0, 255],
        layerId: doc.layers[0]!.id,
      },
    ]);

    render(
      <CatalogCell entry={entry} selected={false} focused={false} onClick={vi.fn()} />,
    );

    expect(screen.getByLabelText("Dirty")).toBeTruthy();
  });

  it("pins via context menu", () => {
    const onTogglePin = vi.fn();
    render(
      <CatalogCell
        entry={entry}
        selected={false}
        focused={false}
        pinned
        onClick={vi.fn()}
        onTogglePin={onTogglePin}
      />,
    );

    expect(screen.getByLabelText("Pinned")).toBeTruthy();
    fireEvent.contextMenu(screen.getByRole("gridcell"));
    expect(onTogglePin).toHaveBeenCalledTimes(1);
  });
});
