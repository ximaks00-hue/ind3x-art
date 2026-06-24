import { test, expect } from "@playwright/test";

/**
 * Native Tauri WebDriver — Block Studio flow scaffold.
 *
 * Requires TAURI_WEBDRIVER_URL pointing at a running tauri-driver session
 * with inD3X Art open and a pack loaded (or use demo pack via UI).
 *
 *   TAURI_WEBDRIVER_URL=http://127.0.0.1:4444 npm run test:e2e:native
 */

const webdriverUrl = process.env.TAURI_WEBDRIVER_URL?.trim();

test.describe("Tauri WebDriver — Block Studio", () => {
  test.beforeAll(() => {
    if (!webdriverUrl) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "Set TAURI_WEBDRIVER_URL to run native WebDriver tests",
      });
    }
  });

  test.skip(!webdriverUrl, "Set TAURI_WEBDRIVER_URL to run native WebDriver tests");

  test("connects to the Tauri webview", async ({ page }) => {
    await page.goto(webdriverUrl!);
    await expect(page.getByText("inD3X Art")).toBeVisible({ timeout: 30_000 });
  });

  test("studio mode toggle is reachable", async ({ page }) => {
    await page.goto(webdriverUrl!);
    await expect(page.getByRole("group", { name: "Workspace mode" })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole("button", { name: "Studio" }).click();
    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("studio catalog panel accepts keyboard focus", async ({ page }) => {
    await page.goto(webdriverUrl!);
    await page.getByRole("button", { name: "Studio" }).click();
    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible({
      timeout: 15_000,
    });
    const catalogPanel = page.locator('[data-tour~="tour-catalog"]');
    await expect(catalogPanel).toBeFocused({ timeout: 5_000 });
  });
});
