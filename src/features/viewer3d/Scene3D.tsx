import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { FaceHighlight } from "./FaceHighlight";
import { FaceRaycaster } from "./FaceRaycaster";
import { MinecraftModel } from "./MinecraftModel";
import { SceneRig } from "./SceneRig";
import styles from "./Scene3D.module.css";

interface Scene3DProps {
  model: RenderableModel;
  handle: ProjectHandle;
}

function SceneControls() {
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  return (
    <OrbitControls
      makeDefault
      enabled={interactionMode === "orbit"}
      enablePan={false}
      minDistance={0.6}
      maxDistance={4}
    />
  );
}

/** Runs inside the Canvas to poll renderer.info.memory each frame and write to store. */
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
  const faces = model.cuboids.reduce((acc, c) => acc + c.faces.length, 0);
  const drawCalls = model.cuboids.length;
  return (
    <div className={styles.devOverlay}>
      <span>{fps} FPS</span>
      <span>{drawCalls} draw calls</span>
      <span>{faces} faces</span>
      <span>AO: {model.ambientOcclusion ? "on" : "off"}</span>
      <span>
        VRAM: {vramTextures} tex / {vramGeometries} geo
      </span>
    </div>
  );
}

export function Scene3D({ model, handle }: Scene3DProps) {
  const interactionMode = useSelectionStore((s) => s.interactionMode);

  return (
    <div
      className={styles.canvasWrap}
      data-interaction-mode={interactionMode}
      data-viewer-canvas="true"
    >
      <Canvas
        camera={{ position: [1.35, 1.05, 1.35], fov: 42, near: 0.01, far: 100 }}
        gl={{ antialias: false, alpha: false }}
        dpr={[1, 2]}
      >
        <color attach="background" args={["#161a22"]} />
        {/* Base ambient */}
        <ambientLight intensity={model.ambientOcclusion ? 0.55 : 0.82} />
        {/* Hemisphere light for AO-like shading: sky vs ground */}
        {model.ambientOcclusion && (
          <hemisphereLight args={[0xffffff, 0x444444, 0.6]} position={[0, 1, 0]} />
        )}
        <directionalLight position={[2.5, 4, 2]} intensity={1.15} castShadow={false} />
        <directionalLight position={[-2, 1.5, -1]} intensity={0.35} />
        <SceneRig />
        <MinecraftModel model={model} handle={handle} />
        <FaceHighlight model={model} />
        <FaceRaycaster model={model} handle={handle} />
        <SceneControls />
        <VramPoller />
      </Canvas>
      <DevOverlay model={model} />
    </div>
  );
}
