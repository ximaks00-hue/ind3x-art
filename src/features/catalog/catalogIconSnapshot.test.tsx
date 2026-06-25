import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { CatalogCell } from "./CatalogCell";
import { resetCatalogIconCache } from "./catalogIconCache";

vi.mock("./CatalogCellCompare", () => ({
  CatalogCellCompare: () => null,
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
  texturePaths: [],
  iconKey: "minecraft:stone:",
  aliases: [],
  studioModelPath: "assets/minecraft/blockstates/stone.json",
  presentation: "block",
};

describe("catalog icon snapshot stability", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    resetCatalogIconCache();
    useProjectStore.setState({ handle: { id: 1 } } as Partial<
      ReturnType<typeof useProjectStore.getState>
    >);
    useSettingsStore.setState({
      catalogShowCellLabels: false,
      catalogIconMode: "auto",
      catalogIconCacheLimit: 256,
      textureCacheLimit: 256,
    });
  });

  it("CatalogCell with real icon status hook does not hit max update depth", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <CatalogCell
        entry={entry}
        columnIndex={0}
        rowIndex={0}
        showLabels={false}
        selected={false}
        focused={false}
        onClick={vi.fn()}
      />,
    );

    const depthErrors = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Maximum update depth"),
    );
    expect(depthErrors).toHaveLength(0);

    errorSpy.mockRestore();
  });
});
