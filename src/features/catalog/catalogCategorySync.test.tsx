import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("./useCatalogKeyboardNav", () => ({
  useCatalogKeyboardNav: vi.fn(),
}));

vi.mock("./useCatalogIconPipeline", () => ({
  useCatalogIconPendingCount: () => 0,
}));

vi.mock("./useCatalogQuickEntries", () => ({
  useCatalogQuickEntries: () => new Map(),
}));

vi.mock("./useCatalogSelection", () => ({
  useCatalogSelection: () => ({ selectEntry: vi.fn() }),
}));

describe("CatalogPanel category sync", () => {
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
      studioSelectedCatalogId: null,
      studioCatalogCategory: "building",
    });
  });

  it("clears stale persisted category without update loop", async () => {
    useCatalogStore.setState({
      category: "building",
      facets: { byCategory: [{ key: "building", count: 0 }] },
      entries: [],
      total: 0,
      loading: false,
      sessionRestorePending: true,
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<CatalogPanel />);

    await waitFor(() => {
      expect(useCatalogStore.getState().category).toBeNull();
      expect(useSettingsStore.getState().studioCatalogCategory).toBeNull();
    });

    const depthErrors = errorSpy.mock.calls.filter((call) =>
      String(call[0]).includes("Maximum update depth"),
    );
    expect(depthErrors).toHaveLength(0);

    errorSpy.mockRestore();
  });
});
