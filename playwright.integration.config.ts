import { defineConfig, devices } from "@playwright/test";

/**
 * Fixture-backed integration tests with mocked IPC (VITE_E2E_MOCK).
 * Covers open → edit → save without a live Tauri backend.
 *
 * For full native IPC coverage, run against `tauri dev` with WebDriver
 * (see docs/TESTING.md).
 */
export default defineConfig({
  testDir: "./e2e/integration",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "html",
  use: {
    baseURL: "http://localhost:1421",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev -- --port 1421",
    url: "http://localhost:1421",
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      VITE_E2E_MOCK: "true",
    },
  },
});
