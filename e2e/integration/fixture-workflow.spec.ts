import { test, expect } from "@playwright/test";

async function waitForApp(page: import("@playwright/test").Page) {
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

test.describe("Fixture workflow (mock IPC)", () => {
  test("open fixture → paint pixel → save", async ({ page }) => {
    await waitForApp(page);

    await page.evaluate(async () => {
      await window.__E2E__!.openFixture();
      await window.__E2E__!.paintTestPixel();
    });

    await expect(page.getByText("No source open")).not.toBeVisible({ timeout: 5_000 });
    const saveBtn = page.getByRole("banner").getByRole("button", { name: /Save/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });

    await saveBtn.click();

    await expect
      .poll(async () => page.evaluate(() => window.__E2E__!.getSavedTextures().length))
      .toBeGreaterThan(0);

    const saved = await page.evaluate(() => window.__E2E__!.getSavedTextures());
    expect(saved).toHaveLength(1);
    expect(saved[0].path).toBe("assets/minecraft/textures/block/test_stone.png");
    expect(saved[0].pngBase64.length).toBeGreaterThan(0);
  });

  test("fill tool + 3D shape draft state (mock paint pipeline)", async ({ page }) => {
    await waitForApp(page);

    const result = await page.evaluate(async () => {
      await window.__E2E__!.openFixture();
      await window.__E2E__!.paintTestFill();
      await window.__E2E__!.setFaceShapeDraft();
      const draft = await window.__E2E__!.getFaceShapeDraft();
      return draft;
    });

    expect(result).not.toBeNull();
    expect(result!.texturePath).toContain("test_stone.png");
    expect(result!.end[0]).toBe(8);
  });
});
