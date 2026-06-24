import { test, expect } from "@playwright/test";

async function waitForApp(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "ind3x-art-settings",
      JSON.stringify({
        state: {
          onboardingCompleted: true,
          studioOnboardingCompleted: true,
          workspaceMode: "studio",
          sessionCount: 10,
          dismissedHints: [
            "explorer-search",
            "command-palette",
            "paint-mode",
            "save",
            "studio-workspace",
            "studio-catalog",
            "studio-paint",
          ],
        },
        version: 0,
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByText("inD3X Art").first()).toBeVisible({ timeout: 15_000 });
}

test.describe("Block Studio workflow (mock IPC)", () => {
  test("catalog → select → paint → save", async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      await window.__E2E__!.openStudioFixture();
    });

    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible({
      timeout: 10_000,
    });

    await expect
      .poll(async () => page.evaluate(() => window.__E2E__!.getCatalogTotal()))
      .toBeGreaterThanOrEqual(2_000);

    await page.getByRole("button", { name: "Test Stone" }).click();

    await expect(page.getByText("Test Stone").first()).toBeVisible({ timeout: 10_000 });

    await page.evaluate(async () => {
      await window.__E2E__!.paintTestPixel();
    });

    const saveBtn = page.getByRole("banner").getByRole("button", { name: /Save/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    await expect
      .poll(async () => page.evaluate(() => window.__E2E__!.getSavedTextures().length))
      .toBeGreaterThan(0);
  });

  test("large catalog scroll keeps grid responsive", async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      await window.__E2E__!.openStudioFixture();
    });

    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible();
    await expect(page.getByText(/2,400 total/)).toBeVisible({ timeout: 10_000 });

    await page.evaluate(() => {
      const panel = document.querySelector('[data-tour~="tour-catalog"]');
      const scroll = panel?.querySelector('[class*="scroll"]') as HTMLElement | null;
      if (scroll) scroll.scrollTop = 3_000;
    });

    await expect(page.getByText(/loaded · .* total/)).toBeVisible();
  });

  test("classic mode still shows explorer after workspace toggle", async ({ page }) => {
    await waitForApp(page);
    await page.getByRole("button", { name: "Classic" }).click();
    await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible({
      timeout: 10_000,
    });
  });
});
