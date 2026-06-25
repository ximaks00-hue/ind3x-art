import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Lock, Trash2, Unlock } from "lucide-react";

import {
  addTextureLayer,
  getActiveLayerId,
  listTextureLayers,
  reorderTextureLayer,
  removeTextureLayer,
  setActiveLayer,
  subscribeTextureDocuments,
  updateTextureLayer,
  type BlendMode,
  type TextureLayer,
} from "./textureDocument";
import { Icon } from "../../ui/icons/Icon";
import styles from "./LayersPanel.module.css";

const BLEND_MODES: BlendMode[] = [
  "normal",
  "multiply",
  "screen",
  "overlay",
  "darken",
  "lighten",
  "color-dodge",
  "color-burn",
  "hard-light",
  "soft-light",
  "difference",
  "exclusion",
];

interface LayersPanelProps {
  texturePath: string | null;
}

export function LayersPanel({ texturePath }: LayersPanelProps) {
  if (!texturePath) return null;
  return <LayersPanelContent key={texturePath} texturePath={texturePath} />;
}

function LayersPanelContent({ texturePath }: { texturePath: string }) {
  const [layers, setLayers] = useState<TextureLayer[]>(() =>
    listTextureLayers(texturePath),
  );
  const [activeId, setActiveId] = useState<string | null>(() =>
    getActiveLayerId(texturePath),
  );
  const dragRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      setLayers(listTextureLayers(texturePath));
      setActiveId(getActiveLayerId(texturePath));
    };
    return subscribeTextureDocuments(refresh);
  }, [texturePath]);

  const reversedLayers = [...layers].reverse();

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Layers</span>
        <button
          type="button"
          className={styles.addBtn}
          onClick={() => addTextureLayer(texturePath)}
          title="Add layer"
        >
          +
        </button>
      </div>
      <ul className={styles.list}>
        {reversedLayers.map((layer, reversedIndex) => {
          const realIndex = layers.length - 1 - reversedIndex;
          return (
            <li
              key={layer.id}
              className={styles.item}
              data-active={layer.id === activeId}
              data-dragover={dragOver === layer.id}
              data-dragging={draggingId === layer.id}
              draggable
              onDragStart={() => {
                dragRef.current = layer.id;
                setDraggingId(layer.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(layer.id);
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={() => {
                const fromId = dragRef.current;
                if (fromId && fromId !== layer.id) {
                  reorderTextureLayer(texturePath, fromId, realIndex);
                }
                dragRef.current = null;
                setDragOver(null);
                setDraggingId(null);
              }}
              onDragEnd={() => {
                dragRef.current = null;
                setDragOver(null);
                setDraggingId(null);
              }}
            >
              <button
                type="button"
                className={styles.selectBtn}
                onClick={() => setActiveLayer(texturePath, layer.id)}
                title={layer.id}
              >
                {layer.name}
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                data-on={layer.visible}
                onClick={() =>
                  updateTextureLayer(texturePath, layer.id, { visible: !layer.visible })
                }
                title={layer.visible ? "Hide layer" : "Show layer"}
              >
                <Icon icon={layer.visible ? Eye : EyeOff} size={16} />
              </button>
              <button
                type="button"
                className={styles.iconBtn}
                data-on={!layer.locked}
                onClick={() =>
                  updateTextureLayer(texturePath, layer.id, { locked: !layer.locked })
                }
                title={layer.locked ? "Unlock layer" : "Lock layer"}
              >
                <Icon icon={layer.locked ? Lock : Unlock} size={16} />
              </button>
              <select
                className={styles.blendSelect}
                value={layer.blendMode}
                title="Blend mode"
                onChange={(e) =>
                  updateTextureLayer(texturePath, layer.id, {
                    blendMode: e.target.value as BlendMode,
                  })
                }
              >
                {BLEND_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <input
                type="range"
                className={styles.opacity}
                min={0}
                max={100}
                value={Math.round(layer.opacity * 100)}
                onChange={(e) =>
                  updateTextureLayer(texturePath, layer.id, {
                    opacity: Number(e.target.value) / 100,
                  })
                }
                title={`Opacity ${Math.round(layer.opacity * 100)}%`}
              />
              <button
                type="button"
                className={styles.iconBtn}
                disabled={layers.length <= 1}
                onClick={() => removeTextureLayer(texturePath, layer.id)}
                title="Delete layer"
              >
                <Icon icon={Trash2} size={16} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
