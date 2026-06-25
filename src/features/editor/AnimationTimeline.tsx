import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { ProjectHandle, TextureAnimationMeta } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { useDocumentRevision } from "./textureDocument";
import { getTextureCanvas } from "./textureDocument";
import styles from "./AnimationTimeline.module.css";

interface AnimationTimelineProps {
  handle: ProjectHandle;
  texturePath: string;
  animation: TextureAnimationMeta;
}

export function AnimationTimeline({
  handle,
  texturePath,
  animation,
}: AnimationTimelineProps) {
  const activeFrame = useEditorStore((s) => s.activeFrame);
  const onionSkin = useEditorStore((s) => s.onionSkin);
  const setActiveFrame = useEditorStore((s) => s.setActiveFrame);
  const setOnionSkin = useEditorStore((s) => s.setOnionSkin);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const duplicateAnimationFrame = useEditorStore((s) => s.duplicateAnimationFrame);
  const deleteAnimationFrame = useEditorStore((s) => s.deleteAnimationFrame);

  const total = animation.frames.length;
  const canvas = getTextureCanvas(texturePath);
  const docRevision = useDocumentRevision();
  const frameH = animation.frameHeight || (canvas ? canvas.height / total : 16);

  const stripDataUrl = useMemo(() => {
    if (!canvas) return null;
    return canvas.toDataURL();
  }, [canvas, docRevision, canvas?.width, canvas?.height]);

  const thumbScale = 24 / Math.max(frameH, 1);

  return (
    <div className={styles.timeline}>
      <div className={styles.toolbar}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => stepFrame(-1, total)}
          title="Prev frame"
        >
          ‹
        </button>
        <span className={styles.badge}>
          Frame {activeFrame + 1}/{total}
        </span>
        <button
          type="button"
          className={styles.btn}
          onClick={() => stepFrame(1, total)}
          title="Next frame"
        >
          ›
        </button>
        <button
          type="button"
          className={onionSkin ? styles.btnOn : styles.btn}
          onClick={() => setOnionSkin(!onionSkin)}
          title="Onion skin"
        >
          Onion
        </button>
        <button
          type="button"
          className={styles.btn}
          onClick={() => duplicateAnimationFrame(texturePath, activeFrame, animation, handle)}
          title="Duplicate frame"
        >
          Dup
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={total <= 1}
          onClick={() => deleteAnimationFrame(texturePath, activeFrame, animation, handle)}
          title="Delete frame"
        >
          Del
        </button>
      </div>
      <div className={styles.strip}>
        {animation.frames.map((frameRow, index) => {
          const thumbStyle: CSSProperties = {};
          if (stripDataUrl && canvas) {
            thumbStyle.backgroundImage = `url(${stripDataUrl})`;
            thumbStyle.backgroundPosition = `0 ${-frameRow * frameH * thumbScale}px`;
            thumbStyle.backgroundSize = `${canvas.width * thumbScale}px auto`;
          }
          return (
            <button
              key={`${frameRow}-${index}`}
              type="button"
              className={index === activeFrame ? styles.thumbActive : styles.thumb}
              style={thumbStyle}
              onClick={() => setActiveFrame(index, total)}
              title={`Frame ${index + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}
