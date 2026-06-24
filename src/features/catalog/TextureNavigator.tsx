import { useMemo } from "react";

import type { RenderableModel } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { isTextureDirty, useDocumentRevision } from "../editor/documentStore";
import { TextureThumbnail } from "../explorer/TextureThumbnail";
import {
  buildUniqueTextureChips,
  isSameModelFace,
  multipartSchematicLabel,
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
  const docRevision = useDocumentRevision();
  const chips = useMemo(() => buildUniqueTextureChips(model), [model]);
  const schematic = useMemo(() => multipartSchematicLabel(model), [model]);
  const dirtyByPath = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const chip of chips) {
      map.set(chip.texturePath, isTextureDirty(chip.texturePath));
    }
    return map;
  }, [chips, docRevision]);

  if (chips.length === 0) return null;

  const faceCount = chips.reduce((sum, chip) => sum + chip.faces.length, 0);

  const handleChipClick = (chip: (typeof chips)[number]) => {
    const activeInChip = chip.faces.find((face) =>
      isSameModelFace(selectedFace, face.cuboidIndex, face.faceIndex),
    );
    if (activeInChip) {
      const idx = chip.faces.indexOf(activeInChip);
      const next = chip.faces[(idx + 1) % chip.faces.length]!;
      onSelectFace(next.cuboidIndex, next.faceIndex);
      return;
    }
    const first = chip.faces[0]!;
    onSelectFace(first.cuboidIndex, first.faceIndex);
  };

  return (
    <nav
      className={styles.nav}
      aria-label="Model textures and faces"
      data-tour="tour-texture-nav"
    >
      <div className={styles.header}>
        <h3 className={styles.title}>Textures</h3>
        <span className={styles.hint}>
          {chips.length} unique · {faceCount} face{faceCount === 1 ? "" : "s"} · click to edit
          {schematic ? ` · ${schematic}` : ""}
        </span>
      </div>
      <div className={styles.row} role="tablist">
        {chips.map((chip) => {
          const active = chip.faces.some((face) =>
            isSameModelFace(selectedFace, face.cuboidIndex, face.faceIndex),
          );
          const dirty = dirtyByPath.get(chip.texturePath) ?? false;
          const directions = [...new Set(chip.faces.map((f) => f.label.split(" · ")[0]))].join(
            ", ",
          );
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={active}
              title={`${chip.label} · ${directions}${chip.faces.length > 1 ? ` (${chip.faces.length} faces)` : ""}`}
              className={[active ? styles.chipActive : styles.chip, dirty ? styles.chipDirty : ""]
                .filter(Boolean)
                .join(" ")}
              onClick={() => handleChipClick(chip)}
            >
              <span className={styles.thumbWrap}>
                <TextureThumbnail assetPath={chip.texturePath} size={32} />
              </span>
              <span className={styles.direction}>
                {chip.label}
                {chips.length > 1 && chip.cuboidLabel !== "Block" ? ` · ${chip.cuboidLabel}` : ""}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
