import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/** Test env: always enable E2E mock IPC (see vite.config.ts dev/prod split). */
const testDefine = {
  "import.meta.env.VITE_E2E_MOCK": JSON.stringify("true"),
};

export default defineConfig({
  plugins: [react()],
  define: testDefine,
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["src/**/*.spike.test.ts", "src/**/*.perf.test.ts"],
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
        "src/**/*.spike.test.ts",
        "src/**/*.perf.test.ts",
        "src/**/vite-env.d.ts",
        "src/ipc/bindings.ts",
        "src/main.tsx",
      ],
      thresholds: {
        // Ratcheted from 15/25/40/15; raise further as UI coverage grows.
        lines: 33,
        functions: 47,
        branches: 50,
        statements: 33,
      },
    },
  },
});
