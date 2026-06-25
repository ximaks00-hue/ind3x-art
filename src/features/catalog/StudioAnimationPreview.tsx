import { useEffect, useState } from "react";

import type { TextureAnimationMeta, TextureMetaInfo } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { useProjectStore } from "../../state/projectStore";
import {
  resumeAnimatedTexture,
  seekAnimatedTextureFrame,
} from "../viewer3d/textureLoader";
import styles from "./StudioAnimationPreview.module.css";

interface StudioAnimationPreviewProps {
  texturePath: string;
  animation: TextureAnimationMeta;
  textureMeta?: TextureMetaInfo;
}

export function StudioAnimationPreview({
  texturePath,
  animation,
  textureMeta,
}: StudioAnimationPreviewProps) {
  const handle = useProjectStore((s) => s.handle);
  const activeFrame = useEditorStore((s) => s.activeFrame);
  const setActiveFrame = useEditorStore((s) => s.setActiveFrame);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const [playing, setPlaying] = useState(false);

  const total = animation.frames.length;

  useEffect(() => {
    if (!handle) return;
    void seekAnimatedTextureFrame(handle, texturePath, activeFrame, textureMeta);
  }, [handle, texturePath, activeFrame, textureMeta]);

  useEffect(() => {
    if (!playing || !handle) return;
    const ms = Math.max(40, animation.frametime * 50);
    const id = setInterval(() => stepFrame(1, total), ms);
    return () => clearInterval(id);
  }, [playing, handle, animation.frametime, stepFrame, total]);

  useEffect(() => {
    return () => {
      if (handle) resumeAnimatedTexture(texturePath, handle);
    };
  }, [handle, texturePath]);

  const togglePlay = () => {
    setPlaying((value) => {
      const next = !value;
      if (!next && handle) resumeAnimatedTexture(texturePath, handle);
      return next;
    });
  };

  return (
    <div className={styles.wrap} role="group" aria-label="Texture animation preview">
      <button
        type="button"
        className={styles.btn}
        onClick={() => {
          setPlaying(false);
          stepFrame(-1, total);
        }}
        aria-label="Previous frame"
      >
        ‹
      </button>
      <button
        type="button"
        className={styles.btn}
        onClick={togglePlay}
        aria-label={playing ? "Pause animation" : "Play animation"}
        aria-pressed={playing}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <span className={styles.badge}>
        {activeFrame + 1}/{total}
      </span>
      <button
        type="button"
        className={styles.btn}
        onClick={() => {
          setPlaying(false);
          stepFrame(1, total);
        }}
        aria-label="Next frame"
      >
        ›
      </button>
      <input
        className={styles.scrub}
        type="range"
        min={0}
        max={Math.max(0, total - 1)}
        value={activeFrame}
        onChange={(e) => {
          setPlaying(false);
          setActiveFrame(Number(e.target.value), total);
        }}
        aria-label="Animation frame"
      />
    </div>
  );
}
