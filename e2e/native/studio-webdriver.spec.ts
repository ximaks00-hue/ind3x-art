import { test, expect } from "@playwright/test";

/**
 * Native Tauri WebDriver — Block Studio flow.
 *
 * Requires TAURI_WEBDRIVER_URL pointing at a running tauri-driver session
 * with inD3X Art open.
 *
 *   TAURI_WEBDRIVER_URL=http://127.0.0.1:4444 npm run test:e2e:native
 */

const webdriverUrl = process.env.TAURI_WEBDRIVER_URL?.trim();

async function gotoApp(page: import("@playwright/test").Page) {
  await page.goto(webdriverUrl!);
  await expect(page.getByText("inD3X Art")).toBeVisible({ timeout: 30_000 });
}

async function openDemoPackIfNeeded(page: import("@playwright/test").Page) {
  const demoBtn = page.getByRole("button", { name: "Try demo pack" });
  if (await demoBtn.isVisible().catch(() => false)) {
    await demoBtn.click();
    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible({
      timeout: 60_000,
    });
  }
}

async function ensureStudioMode(page: import("@playwright/test").Page) {
  const studioBtn = page.getByRole("button", { name: "Studio" });
  if (await studioBtn.isVisible().catch(() => false)) {
    await studioBtn.click();
  }
  await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible({
    timeout: 30_000,
  });
}

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
    await gotoApp(page);
  });

  test("studio mode toggle is reachable", async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByRole("group", { name: "Workspace mode" })).toBeVisible({
      timeout: 30_000,
    });
    await ensureStudioMode(page);
  });

  test("studio catalog panel accepts keyboard focus", async ({ page }) => {
    await gotoApp(page);
    await ensureStudioMode(page);
    const catalogPanel = page.locator('[data-tour~="tour-catalog"]');
    await expect(catalogPanel).toBeFocused({ timeout: 5_000 });
  });

  test("demo pack → catalog select → unfold panel", async ({ page }) => {
    await gotoApp(page);
    await openDemoPackIfNeeded(page);
    await ensureStudioMode(page);

    const stone = page.getByRole("button", { name: "Stone" }).first();
    await expect(stone).toBeVisible({ timeout: 30_000 });
    await stone.click();

    await expect(page.getByRole("region", { name: "UV unfold" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: "Top" })).toBeVisible();
  });

  test("studio viewport shows paint hint after block select", async ({ page }) => {
    await gotoApp(page);
    await openDemoPackIfNeeded(page);
    await ensureStudioMode(page);

    const stone = page.getByRole("button", { name: "Stone" }).first();
    if (await stone.isVisible().catch(() => false)) {
      await stone.click();
    }

    await expect(
      page.getByText(/Click a face to paint|Orbit to inspect/),
    ).toBeVisible({ timeout: 30_000 });
  });
});
