import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { CAMERA_PRESET_TRANSFORMS, type CameraPreset } from "../../lib/cameraPresets";
import { easeOutCubic } from "../../lib/elementRotation";
import { useViewerStore } from "../../state/viewerStore";
import { tickAnimatedTextures } from "./textureLoader";

const TRANSITION_MS = 200;

interface CameraAnim {
  fromPos: THREE.Vector3;
  toPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
}

export function SceneRig() {
  const { camera } = useThree();
  const preset = useViewerStore((s) => s.cameraPreset);
  const presetTick = useViewerStore((s) => s.cameraPresetTick);
  const cameraResetTick = useViewerStore((s) => s.cameraResetTick);
  const faceZoomRequest = useViewerStore((s) => s.faceZoomRequest);
  const setFps = useViewerStore((s) => s.setFps);
  const animRef = useRef<CameraAnim | null>(null);
  const lookTarget = useRef(new THREE.Vector3(0, 0, 0));
  const fpsAccum = useRef(0);
  const fpsFrames = useRef(0);
  const fpsTimer = useRef(0);

  const startAnim = (
    toPos: THREE.Vector3,
    toTarget: THREE.Vector3,
    fromPos = camera.position.clone(),
    fromTarget = lookTarget.current.clone(),
  ) => {
    animRef.current = {
      fromPos,
      toPos,
      fromTarget,
      toTarget,
      start: performance.now(),
    };
  };

  useEffect(() => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    if (preset === "free") {
      animRef.current = null;
      return;
    }
    const cfg = CAMERA_PRESET_TRANSFORMS[preset];
    startAnim(new THREE.Vector3(...cfg.position), new THREE.Vector3(...cfg.target));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera pose driven by preset ticks
  }, [camera, preset, presetTick, cameraResetTick]);

  useEffect(() => {
    if (!faceZoomRequest || !(camera instanceof THREE.PerspectiveCamera)) return;
    startAnim(
      new THREE.Vector3(...faceZoomRequest.position),
      new THREE.Vector3(...faceZoomRequest.target),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by faceZoomRequest.tick
  }, [camera, faceZoomRequest?.tick]);

  useFrame((_, delta) => {
    tickAnimatedTextures(delta);

    if (animRef.current && camera instanceof THREE.PerspectiveCamera) {
      const t = Math.min(1, (performance.now() - animRef.current.start) / TRANSITION_MS);
      const eased = easeOutCubic(t);
      camera.position.lerpVectors(animRef.current.fromPos, animRef.current.toPos, eased);
      lookTarget.current.lerpVectors(
        animRef.current.fromTarget,
        animRef.current.toTarget,
        eased,
      );
      camera.lookAt(lookTarget.current);
      camera.updateProjectionMatrix();
      if (t >= 1) animRef.current = null;
    }

    fpsAccum.current += delta;
    fpsFrames.current += 1;
    fpsTimer.current += delta;
    if (fpsTimer.current >= 0.5) {
      setFps(Math.round(fpsFrames.current / fpsAccum.current));
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
  const cfg = CAMERA_PRESET_TRANSFORMS[preset];
  camera.position.set(...cfg.position);
  camera.lookAt(...cfg.target);
  camera.updateProjectionMatrix();
}
