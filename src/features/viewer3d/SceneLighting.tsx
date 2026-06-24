import { LIGHTING_CONFIGS } from "../../lib/lightingPresets";
import { useViewerLightingPreset } from "../../state/viewerPreferencesSync";

interface SceneLightingProps {
  modelUsesAo: boolean;
}

export function SceneLighting({ modelUsesAo }: SceneLightingProps) {
  const preset = useViewerLightingPreset();
  const config = LIGHTING_CONFIGS[preset];
  const useHemisphere = config.respectModelAo && modelUsesAo && config.hemisphere != null;

  const ambientIntensity =
    config.respectModelAo && modelUsesAo
      ? config.ambient
      : preset === "ingame"
        ? 0.82
        : config.ambient;

  return (
    <>
      <ambientLight
        intensity={ambientIntensity}
        color={config.ambientColor ?? "#ffffff"}
      />
      {useHemisphere && config.hemisphere && (
        <hemisphereLight
          args={[
            config.hemisphere.sky,
            config.hemisphere.ground,
            config.hemisphere.intensity,
          ]}
          position={[0, 1, 0]}
        />
      )}
      <directionalLight
        position={config.key.position}
        intensity={config.key.intensity}
        color={config.key.color ?? "#ffffff"}
        castShadow={false}
      />
      {config.fill.intensity > 0 && (
        <directionalLight
          position={config.fill.position}
          intensity={config.fill.intensity}
          color={config.fill.color ?? "#ffffff"}
        />
      )}
      {config.rim && config.rim.intensity > 0 && (
        <directionalLight
          position={config.rim.position}
          intensity={config.rim.intensity}
          color={config.rim.color ?? "#ffffff"}
        />
      )}
    </>
  );
}
