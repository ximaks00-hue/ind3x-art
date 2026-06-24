import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_E2E_MOCK": JSON.stringify(
      // @ts-expect-error process is a nodejs global
      process.env.NODE_ENV === "production"
        ? "false"
        : (process.env.VITE_E2E_MOCK ?? "false"),
    ),
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/three") ||
            id.includes("node_modules/@react-three")
          ) {
            return "vendor-three";
          }
          if (id.includes("/features/catalog/CatalogIconRenderer")) {
            return "catalog-icons";
          }
          if (
            id.includes("/features/catalog/BlockStudioViewport") ||
            id.includes("/features/catalog/StudioAnimationPreview") ||
            id.includes("/features/catalog/UnfoldPanel")
          ) {
            return "catalog-studio";
          }
          if (
            id.includes("/features/catalog/CatalogPanel") ||
            id.includes("/features/catalog/CatalogVirtualGrid")
          ) {
            return "catalog-panel";
          }
        },
      },
    },
  },
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri` and test output dirs
      ignored: ["**/src-tauri/**", "**/playwright-report/**", "**/test-results/**"],
    },
  },
}));
