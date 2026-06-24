import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { useSelectionStore } from "../../state/selectionStore";
import { FaceRaycaster } from "./FaceRaycaster";

const addEventListener = vi.fn();
const removeEventListener = vi.fn();

vi.mock("@react-three/fiber", () => ({
  useThree: () => ({
    camera: {},
    gl: {
      domElement: {
        addEventListener,
        removeEventListener,
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }),
      },
    },
    scene: { children: [] },
  }),
}));

vi.mock("../editor/usePixelWorker", () => ({
  usePixelWorker: () => ({ current: null }),
}));

vi.mock("../editor/paintInteraction", () => ({
  buildPaintStrokeContext: vi.fn(),
  commitPaintShape: vi.fn(),
  isClickOnlyTool: () => false,
  isShapeTool: () => false,
  paintAtTexturePixel: vi.fn(),
}));

vi.mock("../editor/textureDocument", () => ({
  ensureTextureDocument: vi.fn().mockResolvedValue(undefined),
}));

const handle: ProjectHandle = { id: 1 };

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

describe("FaceRaycaster", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    useSelectionStore.setState({
      interactionMode: "paint",
      selectedFace: null,
      hoveredFace: null,
    });
    useEditorStore.setState({ tool: "brush" });
  });

  it("registers pointer listeners on the canvas and cleans up on unmount", () => {
    const { unmount } = render(
      <FaceRaycaster model={model} handle={handle} studioMode />,
    );

    const eventTypes = addEventListener.mock.calls.map((call) => call[0]);
    expect(eventTypes).toContain("pointerdown");
    expect(eventTypes).toContain("pointermove");
    expect(eventTypes).toContain("pointerup");
    expect(eventTypes).toContain("pointerleave");

    unmount();

    const removedTypes = removeEventListener.mock.calls.map((call) => call[0]);
    expect(removedTypes).toEqual(eventTypes);
  });

  it("clears hovered face on pointer leave in studio mode", () => {
    useSelectionStore.setState({ hoveredFace: { cuboidIndex: 0, faceIndex: 0 } });

    render(<FaceRaycaster model={model} handle={handle} studioMode />);

    const leaveHandler = addEventListener.mock.calls.find(
      (call) => call[0] === "pointerleave",
    )?.[1] as (event: PointerEvent) => void;
    expect(leaveHandler).toBeTypeOf("function");

    leaveHandler(new Event("pointerleave"));
    expect(useSelectionStore.getState().hoveredFace).toBeNull();
  });
});
