import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AssetEntry, ProjectHandle } from "../../ipc/types";
import { ViewerAssetLoader } from "./ViewerAssetLoader";

const clearSelection = vi.fn();
const setActiveTextureMeta = vi.fn();
const listVariants = vi.fn();
const resolveRenderable = vi.fn();
const modelsForTexture = vi.fn();

vi.mock("../../ipc/abortable", () => ({
  withAbortableIpc: (_signal: unknown, invoke: (id: null) => Promise<unknown>) => invoke(null),
}));

vi.mock("../../ipc/client", () => ({
  ipc: {
    listVariants: (...args: unknown[]) => listVariants(...args),
    resolveRenderable: (...args: unknown[]) => resolveRenderable(...args),
    modelsForTexture: (...args: unknown[]) => modelsForTexture(...args),
    finishIpcRequest: vi.fn(),
    cancelIpcRequest: vi.fn(),
  },
}));

vi.mock("../../state/selectionStore", () => ({
  useSelectionStore: (selector: (state: unknown) => unknown) =>
    selector({
      clearSelection,
    }),
}));

vi.mock("../../state/viewerStore", () => ({
  useViewerStore: (selector: (state: unknown) => unknown) =>
    selector({
      setActiveTextureMeta,
    }),
}));

describe("ViewerAssetLoader", () => {
  const handle: ProjectHandle = { id: 1 };
  const selected: AssetEntry = {
    id: "a",
    path: "assets/minecraft/blockstates/stone.json",
    namespace: "minecraft",
    kind: "blockstate",
    displayName: "stone",
    linkedModelCount: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    listVariants.mockResolvedValue([{ key: "", label: "default" }]);
    resolveRenderable.mockResolvedValue({
      name: "stone",
      textures: [],
      elements: [],
      tintFaces: [],
      textureMeta: {},
    });
    modelsForTexture.mockResolvedValue([]);
  });

  it("accepts empty-string blockstate variant key and completes loading", async () => {
    const onLoaded = vi.fn();

    render(
      <ViewerAssetLoader
        handle={handle}
        selected={selected}
        onLoaded={onLoaded}
        variantKey={undefined}
      />,
    );

    await waitFor(() => {
      expect(resolveRenderable).toHaveBeenCalledWith(
        handle,
        selected.path,
        "",
        undefined,
        null,
      );
    });

    const lastCall = onLoaded.mock.calls[onLoaded.mock.calls.length - 1]?.[0];
    expect(lastCall.loading).toBe(false);
    expect(lastCall.error).toBeNull();
    expect(lastCall.variantKey).toBe("");
  });

  it("reports resolve errors without leaving loading state", async () => {
    resolveRenderable.mockRejectedValueOnce(new Error("model missing"));
    const onLoaded = vi.fn();

    render(
      <ViewerAssetLoader
        handle={handle}
        selected={selected}
        onLoaded={onLoaded}
        variantKey={undefined}
      />,
    );

    await waitFor(() => {
      const lastCall = onLoaded.mock.calls[onLoaded.mock.calls.length - 1]?.[0];
      expect(lastCall.loading).toBe(false);
      expect(lastCall.error).toBe("model missing");
      expect(lastCall.renderable).toBeNull();
    });
  });
});
