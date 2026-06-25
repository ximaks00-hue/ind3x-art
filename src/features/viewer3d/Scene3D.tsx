import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { getViewerFps, subscribeViewerFps } from "../../state/viewerFps";
import { FaceHighlight } from "./FaceHighlight";
import { FaceRaycaster } from "./FaceRaycaster";
import { FaceShapePreview } from "./FaceShapePreview";
import { FaceZoomHandler } from "./FaceZoomHandler";
import { MinecraftModel, type MeshBuildState } from "./MinecraftModel";
import { SceneLighting } from "./SceneLighting";
import { SceneRig } from "./SceneRig";
import { MiniSceneTiles } from "./MiniSceneTiles";
import { miniSceneLabel, type MiniSceneSize } from "./miniSceneLayout";
import { UvDebugOverlay } from "./UvDebugOverlay";
import {
  useViewerShowDevOverlay,
  useViewerShowVignette,
} from "../../state/viewerPreferencesSync";
import { Spinner } from "../../ui/primitives/Spinner";
import { PanelErrorBoundary } from "../../ui/PanelErrorBoundary/PanelErrorBoundary";
import styles from "./Scene3D.module.css";

interface Scene3DProps {
  model: RenderableModel;
  handle: ProjectHandle;
  showVignette?: boolean;
  studioMode?: boolean;
  preferredDisplaySlot?: string;
  miniSceneEnabled?: boolean;
  miniSceneSize?: MiniSceneSize;
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
  const fps = useSyncExternalStore(subscribeViewerFps, getViewerFps, () => 0);
  const vramTextures = useViewerStore((s) => s.vramTextures);
  const vramGeometries = useViewerStore((s) => s.vramGeometries);
  const showDevOverlay = useViewerShowDevOverlay();
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

export function Scene3D({
  model,
  handle,
  showVignette = true,
  studioMode = false,
  preferredDisplaySlot,
  miniSceneEnabled = false,
  miniSceneSize = 2,
}: Scene3DProps) {
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const uvDebugMode = useViewerStore((s) => s.uvDebugMode);
  const showVignettePref = useViewerShowVignette();
  const vignetteEnabled = showVignettePref && showVignette;
  const showDevOverlay = useViewerShowDevOverlay();
  const [meshState, setMeshState] = useState<MeshBuildState>("loading");
  const [meshError, setMeshError] = useState<string | null>(null);
  const meshStateHandlerRef = useRef<(state: MeshBuildState, error?: string | null) => void>(
    () => {},
  );

  meshStateHandlerRef.current = (state, error) => {
    setMeshState(state);
    setMeshError(error ?? null);
  };

  useEffect(() => {
    setMeshState("loading");
    setMeshError(null);
  }, [model, handle]);

  return (
    <PanelErrorBoundary name="3D preview">
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
        <MinecraftModel
          model={model}
          handle={handle}
          studioMode={studioMode}
          preferredDisplaySlot={preferredDisplaySlot}
          onMeshState={(state, error) => meshStateHandlerRef.current(state, error)}
        />
        {miniSceneEnabled ? (
          <MiniSceneTiles
            model={model}
            handle={handle}
            size={miniSceneSize}
            studioMode={studioMode}
            preferredDisplaySlot={preferredDisplaySlot}
          />
        ) : null}
        <FaceHighlight model={model} studioMode={studioMode} />
        <FaceShapePreview model={model} />
        <FaceRaycaster model={model} handle={handle} studioMode={studioMode} />
        <FaceZoomHandler />
        {uvDebugMode && <UvDebugOverlay model={model} />}
        <SceneControls />
        {showDevOverlay && <VramPoller />}
      </Canvas>
      {meshState === "loading" ? (
        <div className={styles.meshStatus} role="status">
          <Spinner label="Building 3D mesh…" />
          <span>Building 3D mesh…</span>
        </div>
      ) : null}
      {meshState === "error" ? (
        <div className={styles.meshStatus} role="alert">
          <span className={styles.meshError}>3D preview failed</span>
          <span className={styles.meshErrorDetail}>{meshError}</span>
        </div>
      ) : null}
      {vignetteEnabled && <div className={styles.vignette} aria-hidden />}
      {miniSceneEnabled ? (
        <div className={styles.miniSceneBadge} role="status">
          {miniSceneLabel(miniSceneSize)}
        </div>
      ) : null}
      <DevOverlay model={model} />
    </div>
    </PanelErrorBoundary>
  );
}
