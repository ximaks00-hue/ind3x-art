import { test, expect } from "@playwright/test";

async function waitForApp(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page.getByText("inD3X Art")).toBeVisible({ timeout: 15_000 });
}

test.describe("Fixture workflow (mock IPC)", () => {
  test("open fixture → paint pixel → save", async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      await window.__E2E__!.openFixture();
      await window.__E2E__!.paintTestPixel();
    });

    await expect(page.getByText("No source open")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled({
      timeout: 5_000,
    });

    await page.getByRole("button", { name: "Save" }).click();

    const saved = await page.evaluate(() => window.__E2E__!.getSavedTextures());
    expect(saved).toHaveLength(1);
    expect(saved[0].path).toBe("assets/minecraft/textures/block/test_stone.png");
    expect(saved[0].pngBase64.length).toBeGreaterThan(0);
  });
});
