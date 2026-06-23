import { useEffect, useState } from "react";

import {
  TOOL_HOTKEYS,
  TOOL_LABELS,
  useEditorStore,
  type EditorTool,
} from "../../state/editorStore";
import { useProjectStore } from "../../state/projectStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { ipc } from "../../ipc/client";
import { LayersPanel } from "./LayersPanel";
import { isTextureDirty } from "./textureDocument";
import { canRedo, canUndo, redoTexture, undoTexture } from "./textureDocument";
import { TextureCanvas } from "./TextureCanvas";
import { TextureComparator } from "./TextureComparator";
import styles from "./EditorPanel.module.css";

const TOOLS: EditorTool[] = [
  "pencil",
  "eraser",
  "fill",
  "picker",
  "wand",
  "line",
  "rect",
  "ellipse",
  "select",
  "move",
  "lighten",
  "darken",
  "dither",
];

export function EditorPanel() {
  const handle = useProjectStore((s) => s.handle);
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);

  const tool = useEditorStore((s) => s.tool);
  const color = useEditorStore((s) => s.color);
  const symmetryX = useEditorStore((s) => s.symmetryX);
  const rectFilled = useEditorStore((s) => s.rectFilled);
  const recentColors = useEditorStore((s) => s.recentColors);
  const comparatorEnabled = useEditorStore((s) => s.comparatorEnabled);
  const importPalette = useEditorStore((s) => s.importPalette);
  const setTool = useEditorStore((s) => s.setTool);
  const setColor = useEditorStore((s) => s.setColor);
  const toggleSymmetryX = useEditorStore((s) => s.toggleSymmetryX);
  const setRectFilled = useEditorStore((s) => s.setRectFilled);
  const toggleComparator = useEditorStore((s) => s.toggleComparator);
  const revision = useEditorStore((s) => s.revision);
  const bumpRevision = useEditorStore((s) => s.bumpRevision);
  const activeFrame = useEditorStore((s) => s.activeFrame);
  const setActiveFrame = useEditorStore((s) => s.setActiveFrame);
  const stepFrame = useEditorStore((s) => s.stepFrame);
  const activeTextureMeta = useViewerStore((s) => s.activeTextureMeta);
  const [mcmetaSaving, setMcmetaSaving] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "f") {
        setRectFilled(!rectFilled);
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === "z" && selectedFace && handle) {
          event.preventDefault();
          if (event.shiftKey) {
            redoTexture(handle, selectedFace.texturePath);
          } else {
            undoTexture(handle, selectedFace.texturePath);
          }
          bumpRevision();
          return;
        }
        if (event.key.toLowerCase() === "y" && selectedFace && handle) {
          event.preventDefault();
          redoTexture(handle, selectedFace.texturePath);
          bumpRevision();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handle, selectedFace, bumpRevision, rectFilled, setRectFilled]);

  const dirty = selectedFace && isTextureDirty(selectedFace.texturePath);
  const undoAvailable = Boolean(selectedFace && canUndo(selectedFace.texturePath));
  const redoAvailable = Boolean(selectedFace && canRedo(selectedFace.texturePath));

  void revision;

  const [u1, v1, u2, v2] = selectedFace?.uv ?? [0, 0, 0, 0];

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Texture Editor</h2>
        <p className={styles.subtitle}>
          {dirty ? "Unsaved changes — Ctrl+S to save" : "Ctrl+K commands · ? shortcuts"}
        </p>
      </div>

      <div className={styles.modeRow}>
        <button
          type="button"
          className={interactionMode === "orbit" ? styles.modeActive : styles.modeButton}
          onClick={() => setInteractionMode("orbit")}
        >
          Orbit
        </button>
        <button
          type="button"
          className={interactionMode === "paint" ? styles.modeActive : styles.modeButton}
          onClick={() => setInteractionMode("paint")}
        >
          Paint
        </button>
        <span className={styles.modeHint}>Space toggles</span>
      </div>

      <div className={styles.tools}>
        <div className={styles.toolRow}>
          {TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              className={tool === t ? styles.toolActive : styles.tool}
              onClick={() => setTool(t)}
              title={`${TOOL_LABELS[t]} (${TOOL_HOTKEYS[t]})`}
            >
              {TOOL_LABELS[t]}
            </button>
          ))}
        </div>
        <div className={styles.optionRow}>
          <button
            type="button"
            className={symmetryX ? styles.optionActive : styles.option}
            onClick={toggleSymmetryX}
            title="Mirror strokes on X axis"
          >
            Sym X
          </button>
          <button
            type="button"
            className={rectFilled ? styles.optionActive : styles.option}
            onClick={() => setRectFilled(!rectFilled)}
            title="Filled rectangle (Shift+F)"
          >
            Fill rect
          </button>
          <button
            type="button"
            className={comparatorEnabled ? styles.optionActive : styles.option}
            onClick={toggleComparator}
            title="Before / after comparator (C)"
          >
            Compare
          </button>
        </div>
        <div className={styles.colorRow}>
          <input
            type="color"
            className={styles.colorInput}
            value={color}
            onChange={(e) => setColor(e.target.value)}
            aria-label="Brush color"
          />
          <span className={styles.colorValue}>{color}</span>
          <button
            type="button"
            className={styles.historyButton}
            disabled={!undoAvailable}
            onClick={() => {
              if (handle && selectedFace) {
                undoTexture(handle, selectedFace.texturePath);
                bumpRevision();
              }
            }}
          >
            Undo
          </button>
          <button
            type="button"
            className={styles.historyButton}
            disabled={!redoAvailable}
            onClick={() => {
              if (handle && selectedFace) {
                redoTexture(handle, selectedFace.texturePath);
                bumpRevision();
              }
            }}
          >
            Redo
          </button>
        </div>
        <div className={styles.palette}>
          {recentColors.map((swatch) => (
            <button
              key={swatch}
              type="button"
              className={styles.swatch}
              style={{ background: swatch }}
              data-active={swatch === color}
              onClick={() => setColor(swatch)}
              title={swatch}
            />
          ))}
          <label
            className={styles.paletteImport}
            title="Import palette (.hex / .gpl / .txt — one #rrggbb per line)"
          >
            +
            <input
              type="file"
              accept=".hex,.gpl,.txt,.pal"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const text = reader.result as string;
                  const colors = text
                    .split(/\r?\n/)
                    .map((l) => {
                      const m = l.match(/#([0-9a-fA-F]{6})/);
                      return m ? `#${m[1].toLowerCase()}` : null;
                    })
                    .filter((c): c is string => c !== null);
                  if (colors.length > 0) importPalette(colors);
                };
                reader.readAsText(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      {!selectedFace || !handle ? (
        <div className={styles.canvasPlaceholder}>
          <p>Switch to Paint mode and click a face in the 3D viewer.</p>
        </div>
      ) : (
        <div className={styles.inspector}>
          <dl className={styles.meta}>
            <div>
              <dt>Direction</dt>
              <dd>{selectedFace.direction}</dd>
            </div>
            <div>
              <dt>UV</dt>
              <dd>
                [{u1}, {v1}] → [{u2}, {v2}]
              </dd>
            </div>
            <div>
              <dt>Pixel</dt>
              <dd>
                ({selectedFace.pixel[0]}, {selectedFace.pixel[1]})
              </dd>
            </div>
          </dl>

          <p className={styles.texturePath}>{selectedFace.texturePath}</p>

          {comparatorEnabled ? (
            <TextureComparator handle={handle} selectedFace={selectedFace} />
          ) : (
            <TextureCanvas handle={handle} selectedFace={selectedFace} />
          )}
          {(() => {
            const meta = activeTextureMeta[selectedFace.texturePath];
            const anim = meta?.animation;
            if (!anim || anim.frames.length === 0) return null;
            const total = anim.frames.length;
            return (
              <div className={styles.frameRow}>
                <button
                  type="button"
                  className={styles.frameBtn}
                  onClick={() => stepFrame(-1, total)}
                  title="Prev frame (,)"
                >
                  ‹
                </button>
                <input
                  type="range"
                  min={0}
                  max={total - 1}
                  value={activeFrame}
                  className={styles.frameSlider}
                  onChange={(e) => setActiveFrame(Number(e.target.value))}
                />
                <span className={styles.frameBadge}>
                  {activeFrame + 1} / {total}
                </span>
                <button
                  type="button"
                  className={styles.frameBtn}
                  onClick={() => stepFrame(1, total)}
                  title="Next frame (.)"
                >
                  ›
                </button>
              </div>
            );
          })()}
          {(() => {
            const meta = activeTextureMeta[selectedFace.texturePath];
            const anim = meta?.animation;
            if (!handle || !anim) return null;
            return (
              <div className={styles.mcmetaRow}>
                <span className={styles.mcmetaHint}>
                  Animated · {anim.frames.length}fr · {anim.frametime}t
                </span>
                <button
                  type="button"
                  className={styles.mcmetaBtn}
                  disabled={mcmetaSaving}
                  onClick={async () => {
                    setMcmetaSaving(true);
                    try {
                      await ipc.saveTextureMcmeta(
                        handle,
                        selectedFace.texturePath,
                        JSON.stringify({ animation: meta.animation }),
                      );
                    } finally {
                      setMcmetaSaving(false);
                    }
                  }}
                >
                  {mcmetaSaving ? "Saving…" : "Save .mcmeta"}
                </button>
              </div>
            );
          })()}
          <LayersPanel texturePath={selectedFace.texturePath} />
        </div>
      )}
    </div>
  );
}
