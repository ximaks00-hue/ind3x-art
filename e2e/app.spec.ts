import { test, expect } from "@playwright/test";

/**
 * Basic smoke tests for the inD3X Art web UI.
 *
 * These tests run against the Vite dev server (no Tauri backend).
 * Backend-dependent features are skipped in this mode.
 */

async function waitForAppShell(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByText("inD3X Art")).toBeVisible({ timeout: 15_000 });
}

test.describe("App shell", () => {
  test("renders title bar and welcome screen", async ({ page }) => {
    await waitForAppShell(page);
    await expect(page.getByRole("button", { name: "Open JAR" })).toBeVisible();
    await expect(
      page.getByText("Open a JAR mod or resource folder"),
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

  test("command palette opens from Commands button", async ({ page }) => {
    await waitForAppShell(page);
    await page.getByRole("button", { name: "Commands" }).click();
    await expect(
      page.getByRole("searchbox", { name: "Search commands" }),
    ).toBeVisible();
  });

  test("command palette closes with Escape", async ({ page }) => {
    await waitForAppShell(page);
    await page.getByRole("button", { name: "Commands" }).click();
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
    await expect(page.getByRole("button", { name: "Pencil" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Eraser" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Fill", exact: true }),
    ).toBeVisible();
  });
});
