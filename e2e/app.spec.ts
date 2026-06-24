import { test, expect } from "@playwright/test";

/**
 * Basic smoke tests for the inD3X Art web UI.
 *
 * These tests run against the Vite dev server (no Tauri backend).
 * Backend-dependent features are skipped in this mode.
 */

async function waitForAppShell(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "ind3x-art-settings",
      JSON.stringify({
        state: {
          onboardingCompleted: true,
          sessionCount: 10,
          dismissedHints: ["explorer-search", "command-palette", "paint-mode", "save"],
        },
        version: 0,
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByText("inD3X Art").first()).toBeVisible({ timeout: 15_000 });
}

function titleBar(page: import("@playwright/test").Page) {
  return page.getByRole("banner");
}

test.describe("App shell", () => {
  test("renders title bar and welcome screen", async ({ page }) => {
    await waitForAppShell(page);
    await expect(titleBar(page).getByRole("button", { name: "Open JAR" })).toBeVisible();
    await expect(
      page.getByText("Open a mod JAR or resource pack folder"),
    ).toBeVisible();
  });

  test("command palette opens with Ctrl+K", async ({ page }) => {
    await waitForAppShell(page);
    await page.keyboard.press("Control+k");
    await expect(
      page.getByRole("dialog", { name: "Command palette" }),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Search commands" }),
    ).toBeVisible();
  });

  test("command palette opens from title bar button", async ({ page }) => {
    await waitForAppShell(page);
    await titleBar(page).getByRole("button", { name: "Open command palette" }).click();
    await expect(
      page.getByRole("searchbox", { name: "Search commands" }),
    ).toBeVisible();
  });

  test("command palette closes with Escape", async ({ page }) => {
    await waitForAppShell(page);
    await titleBar(page).getByRole("button", { name: "Open command palette" }).click();
    const paletteInput = page.getByRole("searchbox", { name: "Search commands" });
    await expect(paletteInput).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(paletteInput).not.toBeVisible();
  });

  test("keyboard shortcuts help opens with ?", async ({ page }) => {
    await waitForAppShell(page);
    await page.keyboard.press("?");
    await expect(
      page.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
  });
});

test.describe("Explorer panel", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppShell(page);
  });

  test("shows Assets heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();
  });

  test("view mode buttons are present", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Kind" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tree" })).toBeVisible();
    await expect(page.getByRole("button", { name: "List" })).toBeVisible();
  });
});

test.describe("Editor panel", () => {
  test.beforeEach(async ({ page }) => {
    await waitForAppShell(page);
  });

  test("shows Texture Editor heading", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Texture Editor" }),
    ).toBeVisible();
  });

  test("tool buttons are present", async ({ page }) => {
    const toolbar = page.getByRole("toolbar", { name: "Drawing tools" });
    await expect(toolbar.getByRole("button", { name: "Pencil" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Eraser" })).toBeVisible();
    await expect(toolbar.getByRole("button", { name: "Fill" })).toBeVisible();
  });
});
