import { useMemo } from "react";

import type { RenderableModel } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { isTextureDirty } from "../editor/textureDocument";
import { TextureThumbnail } from "../explorer/TextureThumbnail";
import {
  buildModelFaceNav,
  groupModelFaceNav,
  isSameModelFace,
} from "./modelFaceNav";
import styles from "./TextureNavigator.module.css";

interface TextureNavigatorProps {
  model: RenderableModel;
  selectedFace: SelectedFace | null;
  onSelectFace: (cuboidIndex: number, faceIndex: number) => void;
}

export function TextureNavigator({
  model,
  selectedFace,
  onSelectFace,
}: TextureNavigatorProps) {
  const groups = useMemo(() => {
    const items = buildModelFaceNav(model);
    return groupModelFaceNav(items);
  }, [model]);

  const faceCount = groups.reduce((sum, g) => sum + g.items.length, 0);
  if (faceCount === 0) return null;

  return (
    <nav className={styles.nav} aria-label="Model textures and faces" data-tour="tour-texture-nav">
      <div className={styles.header}>
        <h3 className={styles.title}>Textures</h3>
        <span className={styles.hint}>
          {faceCount} face{faceCount === 1 ? "" : "s"} · click to edit
        </span>
      </div>
      {groups.map((group) => (
        <div key={group.cuboidIndex} className={styles.group}>
          {groups.length > 1 ? (
            <span className={styles.groupLabel}>{group.cuboidLabel}</span>
          ) : null}
          <div className={styles.row} role="tablist">
            {group.items.map((item) => {
              const active = isSameModelFace(
                selectedFace,
                item.cuboidIndex,
                item.faceIndex,
              );
              const dirty = isTextureDirty(item.texturePath);
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  title={item.label}
                  className={[
                    active ? styles.chipActive : styles.chip,
                    dirty ? styles.chipDirty : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => onSelectFace(item.cuboidIndex, item.faceIndex)}
                >
                  <span className={styles.thumbWrap}>
                    <TextureThumbnail assetPath={item.texturePath} size={32} />
                  </span>
                  <span className={styles.direction}>{item.label.split(" · ")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
