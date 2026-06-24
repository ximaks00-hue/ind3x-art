import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";

/** Three.js / react-three-fiber JSX props that are not standard DOM attributes. */
const R3F_UNKNOWN_PROPS = [
  "object",
  "attach",
  "args",
  "intensity",
  "position",
  "castShadow",
  "receiveShadow",
  "rotation",
  "scale",
  "geometry",
  "material",
  "visible",
  "dispose",
  "frustumCulled",
  "renderOrder",
  "userData",
  "matrixAutoUpdate",
];

export default [
  prettierConfig,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "@typescript-eslint": tsPlugin,
      react: reactPlugin,
      "react-hooks": reactHooks,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
    },
    settings: { react: { version: "detect" } },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "no-console": "warn",
    },
  },
  {
    files: ["src/features/viewer3d/**/*.{ts,tsx}"],
    rules: {
      "react/no-unknown-property": ["error", { ignore: R3F_UNKNOWN_PROPS }],
    },
  },
  {
    files: ["src/features/viewer3d/FaceShapePreview.tsx"],
    rules: {
      // revision is intentionally read via void to bust preview when editor commits
      "react-hooks/exhaustive-deps": "off",
    },
  },
  {
    files: ["src/features/explorer/ExplorerPanel.tsx"],
    rules: {
      // TanStack Virtual returns unstable function refs by design.
      "react-hooks/incompatible-library": "off",
    },
  },
  {
    ignores: [
      "dist/**",
      "src-tauri/**",
      "node_modules/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      "src/ipc/bindings.ts",
    ],
  },
];
