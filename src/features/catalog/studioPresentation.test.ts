import { describe, expect, it } from "vitest";

import {
  defaultStudioItemView,
  entryPresentation,
  isItemPresentation,
  studioCameraFor,
  studioDisplaySlotFor,
  studioItemViewOptions,
} from "./studioPresentation";

describe("studioPresentation", () => {
  it("blocks use iso camera without display transform", () => {
    expect(studioCameraFor("block", "placed")).toBe("iso");
    expect(studioDisplaySlotFor("block", "placed")).toBeUndefined();
    expect(studioItemViewOptions("block")).toBeNull();
  });

  it("items support placed, hand, and gui views", () => {
    expect(studioItemViewOptions("item")).toEqual(["placed", "hand", "gui"]);
    expect(studioCameraFor("item", "gui")).toBe("inventory");
    expect(studioDisplaySlotFor("item", "gui")).toBe("gui");
    expect(studioCameraFor("item", "hand")).toBe("front");
    expect(studioDisplaySlotFor("item", "hand")).toBe("thirdperson_righthand");
    expect(studioDisplaySlotFor("item", "placed")).toBeUndefined();
  });

  it("food defaults to gui inventory view", () => {
    expect(defaultStudioItemView("food")).toBe("gui");
    expect(isItemPresentation("food")).toBe(true);
    expect(studioItemViewOptions("food")).toBeNull();
  });

  it("tools and items default to handheld view", () => {
    expect(defaultStudioItemView("tool")).toBe("hand");
    expect(defaultStudioItemView("item")).toBe("hand");
    expect(studioCameraFor("tool", "hand")).toBe("front");
  });

  it("entryPresentation falls back from kind", () => {
    expect(
      entryPresentation({
        presentation: undefined,
        kind: "item",
      } as never),
    ).toBe("item");
  });
});
