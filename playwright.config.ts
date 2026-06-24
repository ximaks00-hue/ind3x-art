import { defineConfig, devices } from "@playwright/test";

/**
 * E2E test config for inD3X Art.
 *
 * Tests run against a local Vite dev server (no Tauri backend required).
 * Use `npm run test:e2e` to run, or `npm run test:e2e:ui` for UI mode.
 *
 * For full Tauri integration tests, start the Tauri dev server separately
 * and point `baseURL` to the Tauri webview URL.
 */
export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/integration/**", "**/native/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:1420",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
