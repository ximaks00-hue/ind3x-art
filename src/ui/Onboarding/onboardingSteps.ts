export interface OnboardingStep {
  title: string;
  body: string;
  target: string;
}

export const CLASSIC_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Open a project",
    body: "Open a mod JAR, resource folder, or try the bundled demo pack to index textures and models.",
    target: "tour-open",
  },
  {
    title: "Select a texture",
    body: "Pick any texture in the explorer — block models and blockstates work too.",
    target: "tour-explorer",
  },
  {
    title: "Paint a face",
    body: "Press Space for Paint mode, click a face in the 3D viewer, then edit in the texture panel.",
    target: "tour-viewer",
  },
  {
    title: "Save your work",
    body: "Press Ctrl+S or use Save in the title bar. Backups are created automatically.",
    target: "tour-save",
  },
];

export const STUDIO_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    title: "Block Studio mode",
    body: "Studio replaces the file explorer with a creative catalog grid — like Minecraft's inventory.",
    target: "tour-workspace-mode",
  },
  {
    title: "Browse the catalog",
    body: "Search and filter by category. Arrow keys move the grid; Enter opens the selected block in 3D.",
    target: "tour-catalog",
  },
  {
    title: "Paint in 3D",
    body: "The viewport loads your pick in Paint mode. Click any face to edit it — top faces are auto-selected for blocks.",
    target: "tour-studio-viewport",
  },
  {
    title: "Switch textures",
    body: "Multipart models (fences, walls) expose each part here. Click a chip to jump to that face's texture.",
    target: "tour-texture-nav",
  },
  {
    title: "Texture editor",
    body: "The right panel shows the active face texture with layers, tools, and undo. Changes are tracked per texture.",
    target: "tour-editor",
  },
  {
    title: "Save your work",
    body: "Ctrl+S saves all dirty textures. Every save creates a backup you can restore from the command palette.",
    target: "tour-save",
  },
];
