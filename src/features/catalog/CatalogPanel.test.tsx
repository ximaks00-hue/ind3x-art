import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogEntry } from "../../ipc/types";
import { useCatalogStore } from "./catalogStore";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { CatalogPanel } from "./CatalogPanel";

vi.mock("../../ui/PanelErrorBoundary/PanelErrorBoundary", () => ({
  PanelErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("./CatalogVirtualGrid", () => ({
  CatalogVirtualGrid: () => <div data-testid="catalog-virtual-grid" />,
}));

vi.mock("./useCatalogQuery", () => ({
  useCatalogLoadMore: () => ({ loadMore: vi.fn(), searchPending: false }),
}));

vi.mock("./useCatalogSessionRestore", () => ({
  useCatalogSessionRestore: vi.fn(),
}));

vi.mock("./useCatalogKeyboardNav", () => ({
  useCatalogKeyboardNav: vi.fn(),
}));

vi.mock("./useCatalogIconPipeline", () => ({
  useCatalogIconPendingCount: () => 0,
}));

vi.mock("./useCatalogQuickEntries", () => ({
  useCatalogQuickEntries: () => new Map<string, CatalogEntry>(),
}));

vi.mock("./useCatalogSelection", () => ({
  useCatalogSelection: () => ({ selectEntry: vi.fn() }),
}));

const stone: CatalogEntry = {
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

describe("CatalogPanel", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    useCatalogStore.getState().reset();
    useProjectStore.setState({
      handle: { id: 1 },
      indexStatus: "done",
      sourcePath: "tests/fixtures/simple_pack",
      fuzzySearch: true,
    } as Partial<ReturnType<typeof useProjectStore.getState>>);
    useSettingsStore.setState({
      workspaceMode: "studio",
      pinnedCatalogIds: [],
      recentCatalogIds: [],
    });
  });

  it("renders catalog header and search", () => {
    useCatalogStore.getState().setQueryPage([stone], 1, false, 0);

    render(<CatalogPanel />);

    expect(screen.getByRole("heading", { name: "Catalog" })).toBeTruthy();
    expect(screen.getByRole("searchbox")).toBeTruthy();
    expect(screen.getByTestId("catalog-virtual-grid")).toBeTruthy();
  });

  it("shows empty state when filters match nothing", () => {
    useCatalogStore.setState({
      entries: [],
      total: 0,
      search: "zzz-no-match",
      category: null,
      facets: { byCategory: [{ key: "building", count: 0 }] },
    });

    render(<CatalogPanel />);

    expect(screen.getByText("No matches")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all items" }));
    expect(useCatalogStore.getState().search).toBe("");
  });

  it("shows open-pack hint when project is not indexed", () => {
    useProjectStore.setState({ handle: null, indexStatus: "idle" } as Partial<
      ReturnType<typeof useProjectStore.getState>
    >);

    render(<CatalogPanel />);

    expect(screen.getByText(/Open a resource pack or try the demo pack/)).toBeTruthy();
  });
});
