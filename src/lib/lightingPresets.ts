export type LightingPreset = "studio" | "ingame" | "flat" | "rim";

export const LIGHTING_PRESET_LABELS: Record<LightingPreset, string> = {
  studio: "Studio",
  ingame: "In-game",
  flat: "Flat",
  rim: "Rim",
};

export interface DirectionalLightConfig {
  position: [number, number, number];
  intensity: number;
  color?: string;
}

export interface LightingConfig {
  ambient: number;
  ambientColor?: string;
  hemisphere?: { sky: string; ground: string; intensity: number };
  key: DirectionalLightConfig;
  fill: DirectionalLightConfig;
  rim?: DirectionalLightConfig;
  respectModelAo: boolean;
}

export const LIGHTING_CONFIGS: Record<LightingPreset, LightingConfig> = {
  studio: {
    ambient: 0.42,
    hemisphere: { sky: "#ffffff", ground: "#3a3f4a", intensity: 0.55 },
    key: { position: [2.5, 4, 2], intensity: 1.2 },
    fill: { position: [-2, 1.5, -1], intensity: 0.38 },
    rim: { position: [-3, 2.5, -2.5], intensity: 0.28, color: "#a8c4ff" },
    respectModelAo: true,
  },
  ingame: {
    ambient: 0.55,
    hemisphere: { sky: "#ffffff", ground: "#444444", intensity: 0.6 },
    key: { position: [2.5, 4, 2], intensity: 1.15 },
    fill: { position: [-2, 1.5, -1], intensity: 0.35 },
    respectModelAo: true,
  },
  flat: {
    ambient: 0.95,
    key: { position: [0, 1, 0], intensity: 0.05 },
    fill: { position: [0, -1, 0], intensity: 0 },
    respectModelAo: false,
  },
  rim: {
    ambient: 0.22,
    key: { position: [1.5, 2, 3], intensity: 0.45 },
    fill: { position: [-1, 0.5, -1], intensity: 0.12 },
    rim: { position: [-4, 2, -3], intensity: 0.85, color: "#7eb8ff" },
    respectModelAo: false,
  },
};

export const LIGHTING_PRESETS: { id: LightingPreset; label: string }[] = (
  Object.keys(LIGHTING_PRESET_LABELS) as LightingPreset[]
).map((id) => ({ id, label: LIGHTING_PRESET_LABELS[id] }));
