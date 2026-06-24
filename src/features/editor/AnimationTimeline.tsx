import type { CSSProperties } from "react";
import type { TextureAnimationMeta } from "../../ipc/types";
import { useEditorStore } from "../../state/editorStore";
import { getTextureCanvas } from "./textureDocument";
import styles from "./AnimationTimeline.module.css";

interface AnimationTimelineProps {
  texturePath: string;
  animation: TextureAnimationMeta;
}

export function AnimationTimeline({ texturePath, animation }: AnimationTimelineProps) {
  const activeFrame = useEditorStore((s) => s.activeFrame);
  const onionSkin = useEditorStore((s) => s.onionSkin);
  const setActiveFrame = useEditorStore((s) => s.setActiveFrame);
  const setOnionSkin = useEditorStore((s) => s.setOnionSkin);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const duplicateAnimationFrame = useEditorStore((s) => s.duplicateAnimationFrame);
  const deleteAnimationFrame = useEditorStore((s) => s.deleteAnimationFrame);

  const total = animation.frames.length;
  const canvas = getTextureCanvas(texturePath);
  const frameH = animation.frameHeight || (canvas ? canvas.height / total : 16);

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
          onClick={() => duplicateAnimationFrame(texturePath, activeFrame, animation)}
          title="Duplicate frame"
        >
          Dup
        </button>
        <button
          type="button"
          className={styles.btn}
          disabled={total <= 1}
          onClick={() => deleteAnimationFrame(texturePath, activeFrame, animation)}
          title="Delete frame"
        >
          Del
        </button>
      </div>
      <div className={styles.strip}>
        {animation.frames.map((frameRow, index) => {
          const thumbStyle: CSSProperties = {};
          if (canvas) {
            const scale = 24 / Math.max(frameH, 1);
            thumbStyle.backgroundImage = `url(${canvas.toDataURL()})`;
            thumbStyle.backgroundPosition = `0 ${-frameRow * frameH * scale}px`;
            thumbStyle.backgroundSize = `${canvas.width * scale}px auto`;
          }
          return (
            <button
              key={`${frameRow}-${index}`}
              type="button"
              className={index === activeFrame ? styles.thumbActive : styles.thumb}
              style={thumbStyle}
              onClick={() => setActiveFrame(index)}
              title={`Frame ${index + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}
