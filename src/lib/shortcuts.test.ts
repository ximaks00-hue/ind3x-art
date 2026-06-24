import { describe, expect, it } from "vitest";

import {
  formatShortcutDisplay,
  SHORTCUT_DEFINITIONS,
  shortcutForTool,
} from "./shortcuts";

describe("shortcuts", () => {
  it("defines all 13 editor tools", () => {
    const tools = SHORTCUT_DEFINITIONS.filter((s) => s.id.startsWith("tool-"));
    expect(tools).toHaveLength(13);
  });

  it("formats display shortcuts", () => {
    expect(formatShortcutDisplay("ctrl+k")).toBe("Ctrl+K");
    expect(formatShortcutDisplay("b")).toBe("B");
  });

  it("returns tool shortcut when bound", () => {
    expect(shortcutForTool("pencil")).toBe("B");
    expect(shortcutForTool("lighten")).toBeUndefined();
  });
});
