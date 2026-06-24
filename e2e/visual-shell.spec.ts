import { test, expect } from "@playwright/test";

/**
 * Visual regression for the welcome shell (no Tauri backend).
 * Snapshots live next to this file under visual-shell.spec.ts-snapshots/.
 */

test.describe("Visual regression", () => {
  test("welcome shell matches baseline", async ({ page }) => {
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
    await expect(page.getByRole("banner").getByRole("button", { name: "Open JAR" })).toBeVisible();

    await expect(page).toHaveScreenshot("welcome-shell.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
      fullPage: false,
    });
  });
});
