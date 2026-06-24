import { defineConfig } from "@playwright/test";

/**
 * Native Tauri WebDriver tests — optional, requires a running WebDriver endpoint.
 *
 *   TAURI_WEBDRIVER_URL=http://127.0.0.1:4444 npm run test:e2e:native
 *
 * See docs/TESTING.md for tauri-driver setup.
 */
export default defineConfig({
  testDir: "./e2e/native",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    trace: "on-first-retry",
  },
});
