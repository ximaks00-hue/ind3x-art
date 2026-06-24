import { test, expect } from "@playwright/test";

/**
 * Native Tauri WebDriver path — requires TAURI_WEBDRIVER_URL.
 *
 * Local:
 *   TAURI_WEBDRIVER_URL=http://127.0.0.1:4444 npm run test:e2e:native
 *
 * CI: optional job `native-e2e` runs when the repo secret is configured.
 */

const webdriverUrl = process.env.TAURI_WEBDRIVER_URL?.trim();

test.describe("Tauri WebDriver (native)", () => {
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

  test("scaffold: webdriver URL is a valid HTTP endpoint", async ({ request }) => {
    const response = await request.get(webdriverUrl!);
    expect(response.status()).toBeLessThan(500);
  });
});
