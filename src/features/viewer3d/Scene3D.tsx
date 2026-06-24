import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { FaceHighlight } from "./FaceHighlight";
import { FaceRaycaster } from "./FaceRaycaster";
import { FaceShapePreview } from "./FaceShapePreview";
import { FaceZoomHandler } from "./FaceZoomHandler";
import { MinecraftModel } from "./MinecraftModel";
import { SceneLighting } from "./SceneLighting";
import { SceneRig } from "./SceneRig";
import { UvDebugOverlay } from "./UvDebugOverlay";
import styles from "./Scene3D.module.css";

interface Scene3DProps {
  model: RenderableModel;
  handle: ProjectHandle;
  showVignette?: boolean;
}

function SceneControls() {
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const cameraPreset = useViewerStore((s) => s.cameraPreset);

  return (
    <OrbitControls
      makeDefault
      enabled={interactionMode === "orbit" && cameraPreset === "free"}
      enablePan={false}
      minDistance={0.35}
      maxDistance={4}
      zoomSpeed={0.65}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.85}
    />
  );
}

function VramPoller() {
  const { gl } = useThree();
  const setVram = useViewerStore((s) => s.setVram);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => {
      const m = gl.info.memory;
      setVram(m.textures, m.geometries);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gl, setVram]);

  return null;
}

interface DevOverlayProps {
  model: RenderableModel;
}

function DevOverlay({ model }: DevOverlayProps) {
  const fps = useViewerStore((s) => s.fps);
  const vramTextures = useViewerStore((s) => s.vramTextures);
  const vramGeometries = useViewerStore((s) => s.vramGeometries);
  const showDevOverlay = useViewerStore((s) => s.showDevOverlay);
  const uvDebugMode = useViewerStore((s) => s.uvDebugMode);
  if (!showDevOverlay && !uvDebugMode) return null;

  const faces = model.cuboids.reduce((acc, c) => acc + c.faces.length, 0);
  const drawCalls = model.cuboids.length;

  return (
    <div className={styles.devOverlay}>
      {showDevOverlay && (
        <>
          <span>{fps} FPS</span>
          <span>{drawCalls} draw calls</span>
          <span>{faces} faces</span>
          <span>AO: {model.ambientOcclusion ? "on" : "off"}</span>
          <span>
            VRAM: {vramTextures} tex / {vramGeometries} geo
          </span>
        </>
      )}
      {uvDebugMode && <span>UV debug</span>}
    </div>
  );
}

export function Scene3D({ model, handle, showVignette = true }: Scene3DProps) {
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const uvDebugMode = useViewerStore((s) => s.uvDebugMode);
  const vignetteEnabled = useViewerStore((s) => s.showVignette) && showVignette;
  const showDevOverlay = useViewerStore((s) => s.showDevOverlay);

  return (
    <div
      className={styles.canvasWrap}
      data-interaction-mode={interactionMode}
      data-viewer-canvas="true"
    >
      <Canvas
        camera={{ position: [1.35, 1.05, 1.35], fov: 42, near: 0.01, far: 100 }}
        gl={{ antialias: false, alpha: true }}
        dpr={[1, 2]}
      >
        <SceneLighting modelUsesAo={model.ambientOcclusion} />
        <SceneRig />
        <MinecraftModel model={model} handle={handle} />
        <FaceHighlight model={model} />
        <FaceShapePreview model={model} />
        <FaceRaycaster model={model} handle={handle} />
        <FaceZoomHandler />
        {uvDebugMode && <UvDebugOverlay model={model} />}
        <SceneControls />
        {showDevOverlay && <VramPoller />}
      </Canvas>
      {vignetteEnabled && <div className={styles.vignette} aria-hidden />}
      <DevOverlay model={model} />
    </div>
  );
}
