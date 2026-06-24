import { useEditorStore } from "../../state/editorStore";
import { useInteractionStore } from "../../state/interactionStore";
import { useProjectStore } from "../../state/projectStore";
import { useSelectionStore } from "../../state/selectionStore";
import { useViewerStore } from "../../state/viewerStore";
import { AnimationTimeline } from "./AnimationTimeline";
import { EditorEmptyState } from "./EditorEmptyState";
import { LayersPanel } from "./LayersPanel";
import { McmetaEditor } from "./McmetaEditor";
import { PalettePanel } from "./PalettePanel";
import { ToolIconBar } from "./ToolIconBar";
import { ToolOptionsBar } from "./ToolOptionsBar";
import {
  getDirtyTexturePaths,
  isTextureDirty,
  canRedo,
  canUndo,
  peekRedoLabel,
  peekUndoLabel,
  redoTexture,
  undoTexture,
} from "./textureDocument";
import { TextureCanvas } from "./TextureCanvas";
import { TextureComparator } from "./TextureComparator";
import styles from "./EditorPanel.module.css";

export function EditorPanel() {
  const handle = useProjectStore((s) => s.handle);
  const selectedFace = useSelectionStore((s) => s.selectedFace);
  const interactionMode = useSelectionStore((s) => s.interactionMode);
  const setInteractionMode = useSelectionStore((s) => s.setInteractionMode);
  const pickFrom3dHighlight = useEditorStore((s) => s.pickFrom3dHighlight);
  const setPickFrom3dHighlight = useEditorStore((s) => s.setPickFrom3dHighlight);
  const getAnimationMeta = useEditorStore((s) => s.getAnimationMeta);
  const setAnimationOverride = useEditorStore((s) => s.setAnimationOverride);
  const comparatorMode = useInteractionStore((s) => s.comparatorMode);
  const cycleComparator = useInteractionStore((s) => s.cycleComparator);
  const bumpRevision = useEditorStore((s) => s.bumpRevision);
  const revision = useEditorStore((s) => s.revision);
  const activeTextureMeta = useViewerStore((s) => s.activeTextureMeta);

  void revision;

  const dirty = selectedFace && isTextureDirty(selectedFace.texturePath);
  const dirtyPaths = getDirtyTexturePaths();
  const undoAvailable = Boolean(selectedFace && canUndo(selectedFace.texturePath));
  const redoAvailable = Boolean(selectedFace && canRedo(selectedFace.texturePath));
  const undoLabel = selectedFace ? peekUndoLabel(selectedFace.texturePath) : null;
  const redoLabel = selectedFace ? peekRedoLabel(selectedFace.texturePath) : null;

  const [u1, v1, u2, v2] = selectedFace?.uv ?? [0, 0, 0, 0];

  const animMeta =
    selectedFace &&
    getAnimationMeta(
      selectedFace.texturePath,
      activeTextureMeta[selectedFace.texturePath]?.animation,
    );
  const animationOverride = useEditorStore((s) =>
    selectedFace ? s.animationOverrides[selectedFace.texturePath] : undefined,
  );
  const baseAnim = selectedFace
    ? activeTextureMeta[selectedFace.texturePath]?.animation
    : undefined;

  return (
    <div className={styles.panel} data-tour="tour-editor">
      <div className={styles.header}>
        <h2 className={styles.title}>Texture Editor</h2>
        <p className={styles.subtitle}>
          {dirty ? "Unsaved changes — Ctrl+S to save" : "Ctrl+K commands · ? shortcuts"}
        </p>
        {dirtyPaths.length > 0 && (
          <p className={styles.dirtyTabs}>
            {dirtyPaths.length} dirty texture{dirtyPaths.length === 1 ? "" : "s"}
            {dirtyPaths.length <= 3
              ? `: ${dirtyPaths.map((p) => p.split("/").pop()).join(", ")}`
              : ""}
          </p>
        )}
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
        <button
          type="button"
          className={pickFrom3dHighlight ? styles.modeActive : styles.modeButton}
          onClick={() => setPickFrom3dHighlight(!pickFrom3dHighlight)}
          title="Highlight picked face in 3D viewer"
        >
          Pick 3D
        </button>
        <span className={styles.modeHint}>Space toggles orbit/paint</span>
      </div>

      <div className={styles.tools}>
        <ToolIconBar />
        <ToolOptionsBar />
        <div className={styles.historyRow}>
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
            title={undoLabel ? `Undo: ${undoLabel}` : "Undo"}
          >
            {undoLabel ? `Undo: ${undoLabel}` : "Undo"}
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
            title={redoLabel ? `Redo: ${redoLabel}` : "Redo"}
          >
            {redoLabel ? `Redo: ${redoLabel}` : "Redo"}
          </button>
          <button
            type="button"
            className={comparatorMode != null ? styles.optionActive : styles.option}
            onClick={() => cycleComparator(useViewerStore.getState().currentRenderable)}
          >
            Compare
            {comparatorMode === "2d" ? " 2D" : comparatorMode === "3d" ? " 3D" : ""}
          </button>
        </div>
      </div>

      <PalettePanel />

      {!selectedFace || !handle ? (
        <EditorEmptyState />
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

          {comparatorMode === "2d" ? (
            <TextureComparator handle={handle} selectedFace={selectedFace} />
          ) : (
            <TextureCanvas handle={handle} selectedFace={selectedFace} />
          )}

          {animMeta && animMeta.frames.length > 0 && (
            <>
              <AnimationTimeline
                texturePath={selectedFace.texturePath}
                animation={animMeta}
              />
              <McmetaEditor
                handle={handle}
                texturePath={selectedFace.texturePath}
                baseMeta={animMeta}
              />
            </>
          )}

          {!animationOverride && baseAnim && animMeta && (
            <button
              type="button"
              className={styles.editAnimBtn}
              onClick={() => setAnimationOverride(selectedFace.texturePath, baseAnim)}
            >
              Edit animation
            </button>
          )}

          <LayersPanel texturePath={selectedFace.texturePath} />
        </div>
      )}
    </div>
  );
}
