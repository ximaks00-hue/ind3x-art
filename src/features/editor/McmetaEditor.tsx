import { useState } from "react";

import type { ProjectHandle, TextureAnimationMeta } from "../../ipc/types";
import { ipc } from "../../ipc/client";
import { useEditorStore } from "../../state/editorStore";
import styles from "./McmetaEditor.module.css";

interface McmetaEditorProps {
  handle: ProjectHandle;
  texturePath: string;
  baseMeta: TextureAnimationMeta;
}

export function McmetaEditor({ handle, texturePath, baseMeta }: McmetaEditorProps) {
  const override = useEditorStore((s) => s.animationOverrides[texturePath]);
  const setAnimationOverride = useEditorStore((s) => s.setAnimationOverride);
  const meta = override ?? baseMeta;

  return (
    <McmetaEditorForm
      key={`${texturePath}:${meta.frametime}:${meta.interpolate}`}
      handle={handle}
      texturePath={texturePath}
      meta={meta}
      setAnimationOverride={setAnimationOverride}
    />
  );
}

function McmetaEditorForm({
  handle,
  texturePath,
  meta,
  setAnimationOverride,
}: {
  handle: ProjectHandle;
  texturePath: string;
  meta: TextureAnimationMeta;
  setAnimationOverride: (path: string, meta: TextureAnimationMeta | null) => void;
}) {
  const [frametime, setFrametime] = useState(meta.frametime);
  const [interpolate, setInterpolate] = useState(meta.interpolate);
  const [saving, setSaving] = useState(false);

  const applyLocal = () => {
    setAnimationOverride(texturePath, {
      ...meta,
      frametime,
      interpolate,
    });
  };

  return (
    <div className={styles.panel}>
      <span className={styles.title}>Animation (.mcmeta)</span>
      <div className={styles.row}>
        <label className={styles.field}>
          Frametime (ticks)
          <input
            type="number"
            min={1}
            max={600}
            value={frametime}
            onChange={(e) => setFrametime(Number(e.target.value))}
            onBlur={applyLocal}
          />
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={interpolate}
            onChange={(e) => {
              setInterpolate(e.target.checked);
              setAnimationOverride(texturePath, {
                ...meta,
                frametime,
                interpolate: e.target.checked,
              });
            }}
          />
          Interpolate
        </label>
      </div>
      <p className={styles.hint}>
        {meta.frames.length} frames · height {meta.frameHeight}px
      </p>
      <button
        type="button"
        className={styles.saveBtn}
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            const payload = {
              animation: {
                frametime,
                interpolate,
                frames: meta.frames,
              },
            };
            await ipc.saveTextureMcmeta(handle, texturePath, JSON.stringify(payload));
            setAnimationOverride(texturePath, { ...meta, frametime, interpolate });
          } finally {
            setSaving(false);
          }
        }}
      >
        {saving ? "Saving…" : "Save .mcmeta"}
      </button>
    </div>
  );
}
