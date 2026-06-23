import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import type { CameraPreset } from "../../state/viewerStore";
import { useViewerStore } from "../../state/viewerStore";
import { tickAnimatedTextures } from "./textureLoader";

const CAMERA_PRESETS: Record<
  Exclude<CameraPreset, "free">,
  { position: [number, number, number]; target: [number, number, number] }
> = {
  front: { position: [0, 0, 2.2], target: [0, 0, 0] },
  iso: { position: [1.35, 1.05, 1.35], target: [0, 0, 0] },
  top: { position: [0, 2.3, 0.01], target: [0, 0, 0] },
  inventory: { position: [0.2, 0.15, 1.9], target: [0, 0, 0] },
};

export function SceneRig() {
  const { camera } = useThree();
  const preset = useViewerStore((s) => s.cameraPreset);
  const presetTick = useViewerStore((s) => s.cameraPresetTick);
  const setFps = useViewerStore((s) => s.setFps);
  const fpsAccum = useRef(0);
  const fpsFrames = useRef(0);
  const fpsTimer = useRef(0);

  useEffect(() => {
    if (preset === "free") return;
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    applyCameraPreset(camera, preset);
  }, [camera, preset, presetTick]);

  useFrame((_, delta) => {
    tickAnimatedTextures(delta);

    fpsAccum.current += delta;
    fpsFrames.current += 1;
    fpsTimer.current += delta;
    if (fpsTimer.current >= 0.5) {
      const fps = Math.round(fpsFrames.current / fpsAccum.current);
      setFps(fps);
      fpsAccum.current = 0;
      fpsFrames.current = 0;
      fpsTimer.current = 0;
    }
  });

  return null;
}

export function applyCameraPreset(
  camera: THREE.PerspectiveCamera,
  preset: Exclude<CameraPreset, "free">,
): void {
  const cfg = CAMERA_PRESETS[preset];
  camera.position.set(...cfg.position);
  camera.lookAt(...cfg.target);
  camera.updateProjectionMatrix();
}
