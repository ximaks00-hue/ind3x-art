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

test.describe("integration failure paths (mock IPC)", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => window.__E2E__?.clearFaultConfig());
  });

  test("save failure surfaces an error toast", async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(async () => {
      await window.__E2E__!.openStudioFixture();
    });
    await page.evaluate(async () => {
      await window.__E2E__!.paintTestPixel();
    });

    await page.evaluate(() => {
      window.__E2E__!.setFaultConfig({ failOps: ["saveTextures"] });
    });

    const saveBtn = page.getByRole("banner").getByRole("button", { name: /Save/i });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    await expect(page.getByText(/injected failure at saveTextures/i)).toBeVisible({
      timeout: 5_000,
    });
    await expect
      .poll(async () => page.evaluate(() => window.__E2E__!.getSavedTextures().length))
      .toBe(0);
  });

  test("catalog query failure shows error toast", async ({ page }) => {
    await waitForApp(page);
    await page.evaluate(async () => {
      await window.__E2E__!.openStudioFixture();
    });
    await expect(page.getByRole("heading", { name: "Catalog" })).toBeVisible({
      timeout: 10_000,
    });

    await page.evaluate(() => {
      window.__E2E__!.setFaultConfig({ failOps: ["queryCatalog"] });
    });
    await page.getByLabel("Search catalog").fill("stone");

    await expect(page.getByText(/Catalog query failed/i)).toBeVisible({ timeout: 10_000 });
  });

  test("session restore dialog offers last project", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "ind3x-art-settings",
        JSON.stringify({
          state: {
            onboardingCompleted: true,
            studioOnboardingCompleted: true,
            workspaceMode: "classic",
            sessionCount: 2,
            lastSessionPath: "tests/fixtures/simple_pack",
            dismissedHints: [
              "explorer-search",
              "command-palette",
              "paint-mode",
              "save",
            ],
          },
          version: 0,
        }),
      );
    });
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: "Restore session" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("simple_pack")).toBeVisible();
    await page.getByRole("button", { name: "Not now" }).click();
    await expect(page.getByRole("dialog", { name: "Restore session" })).toBeHidden();
  });

  test("session restore open failure surfaces error", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        "ind3x-art-settings",
        JSON.stringify({
          state: {
            onboardingCompleted: true,
            studioOnboardingCompleted: true,
            workspaceMode: "classic",
            sessionCount: 2,
            lastSessionPath: "tests/fixtures/simple_pack",
            dismissedHints: [
              "explorer-search",
              "command-palette",
              "paint-mode",
              "save",
            ],
          },
          version: 0,
        }),
      );
    });
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: "Restore session" })).toBeVisible({
      timeout: 15_000,
    });

    await page.evaluate(() => {
      window.__E2E__!.setFaultConfig({ failOps: ["openSource"] });
    });
    await page.getByRole("button", { name: "Open project" }).click();
    await expect(page.getByText(/Failed to open/i)).toBeVisible({ timeout: 10_000 });
  });
});
