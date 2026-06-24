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
      include: [
        "src/features/editor/paintEngine.ts",
        "src/features/editor/tools.ts",
        "src/features/viewer3d/uvMapping.ts",
        "src/features/editor/textureDocument.ts",
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 65,
        statements: 70,
      },
    },
  },
});
