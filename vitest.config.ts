import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    globals: false,
    setupFiles: ["src/test/setup.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    maxWorkers: process.env.CI ? 2 : undefined,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/vite-env.d.ts",
        "src/ipc/bindings.ts",
        "src/main.tsx",
      ],
      thresholds: {
        lines: 15,
        functions: 25,
        branches: 40,
        statements: 15,
      },
    },
  },
});
