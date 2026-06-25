import { useEditorStore } from "../../state/editorStore";
import styles from "./ToolOptionsBar.module.css";

export function ToolOptionsBar() {
  const tool = useEditorStore((s) => s.tool);
  const brushSize = useEditorStore((s) => s.brushSize);
  const brushOpacity = useEditorStore((s) => s.brushOpacity);
  const fillTolerance = useEditorStore((s) => s.fillTolerance);
  const brushMode = useEditorStore((s) => s.brushMode);
  const symmetryX = useEditorStore((s) => s.symmetryX);
  const symmetryY = useEditorStore((s) => s.symmetryY);
  const stabilizer = useEditorStore((s) => s.stabilizer);
  const pixelPerfectLine = useEditorStore((s) => s.pixelPerfectLine);
  const rectFilled = useEditorStore((s) => s.rectFilled);
  const setBrushSize = useEditorStore((s) => s.setBrushSize);
  const setBrushOpacity = useEditorStore((s) => s.setBrushOpacity);
  const setFillTolerance = useEditorStore((s) => s.setFillTolerance);
  const setBrushMode = useEditorStore((s) => s.setBrushMode);
  const toggleSymmetryX = useEditorStore((s) => s.toggleSymmetryX);
  const toggleSymmetryY = useEditorStore((s) => s.toggleSymmetryY);
  const setStabilizer = useEditorStore((s) => s.setStabilizer);
  const setPixelPerfectLine = useEditorStore((s) => s.setPixelPerfectLine);
  const setRectFilled = useEditorStore((s) => s.setRectFilled);

  const showTolerance = tool === "fill" || tool === "wand";
  const showOpacity = tool !== "picker" && tool !== "select" && tool !== "move";
  const showSize =
    tool === "pencil" ||
    tool === "eraser" ||
    tool === "lighten" ||
    tool === "darken" ||
    tool === "dither";

  return (
    <div className={styles.bar}>
      {showSize && (
        <label className={styles.field}>
          Size
          <input
            type="range"
            className="range-premium"
            min={1}
            max={32}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
          />
          <span className={styles.value}>{brushSize}</span>
        </label>
      )}
      {showOpacity && (
        <label className={styles.field}>
          Opacity
          <input
            type="range"
            className="range-premium"
            min={5}
            max={100}
            value={Math.round(brushOpacity * 100)}
            onChange={(e) => setBrushOpacity(Number(e.target.value) / 100)}
          />
          <span className={styles.value}>{Math.round(brushOpacity * 100)}%</span>
        </label>
      )}
      {showTolerance && (
        <label className={styles.field}>
          Tolerance
          <input
            type="range"
            className="range-premium"
            min={0}
            max={255}
            value={fillTolerance}
            onChange={(e) => setFillTolerance(Number(e.target.value))}
          />
          <span className={styles.value}>{fillTolerance}</span>
        </label>
      )}
      <label className={styles.field}>
        Mode
        <select
          className={styles.select}
          value={brushMode}
          onChange={(e) => setBrushMode(e.target.value as "normal" | "replace")}
        >
          <option value="normal">Normal</option>
          <option value="replace">Replace</option>
        </select>
      </label>
      <div className={styles.toggles}>
        <button
          type="button"
          className={symmetryX ? styles.toggleOn : styles.toggle}
          onClick={toggleSymmetryX}
          title="Mirror X"
        >
          Sym X
        </button>
        <button
          type="button"
          className={symmetryY ? styles.toggleOn : styles.toggle}
          onClick={toggleSymmetryY}
          title="Mirror Y"
        >
          Sym Y
        </button>
        <button
          type="button"
          className={rectFilled ? styles.toggleOn : styles.toggle}
          onClick={() => setRectFilled(!rectFilled)}
          title="Filled shapes"
        >
          Fill
        </button>
        <button
          type="button"
          className={pixelPerfectLine ? styles.toggleOn : styles.toggle}
          onClick={() => setPixelPerfectLine(!pixelPerfectLine)}
          title="Pixel-perfect lines"
        >
          PP
        </button>
      </div>
      <label className={styles.field}>
        Stabilizer
        <input
          type="range"
          className="range-premium"
          min={0}
          max={8}
          value={stabilizer}
          onChange={(e) => setStabilizer(Number(e.target.value))}
        />
        <span className={styles.value}>{stabilizer}</span>
      </label>
    </div>
  );
}
