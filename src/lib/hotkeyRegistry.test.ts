import { describe, expect, it } from "vitest";

import { HOTKEY_BINDINGS, matchShortcut } from "../lib/hotkeyRegistry";

describe("hotkeyRegistry keyboard workflow", () => {
  it("matches focus mode shortcut Ctrl+\\", () => {
    const event = new KeyboardEvent("keydown", {
      key: "\\",
      ctrlKey: true,
      bubbles: true,
    });
    expect(matchShortcut(event, HOTKEY_BINDINGS.toggleFocusMode.shortcut)).toBe(true);
  });

  it("matches explorer focus Ctrl+F", () => {
    const event = new KeyboardEvent("keydown", {
      key: "f",
      ctrlKey: true,
      bubbles: true,
    });
    expect(matchShortcut(event, HOTKEY_BINDINGS.focusExplorer.shortcut)).toBe(true);
  });
});
