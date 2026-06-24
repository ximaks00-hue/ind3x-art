import { useRef } from "react";

import { useEditorStore } from "../../state/editorStore";
import { MINECRAFT_PALETTES, type MinecraftPaletteId } from "./minecraftPalettes";
import styles from "./PalettePanel.module.css";

export function ColorHistoryRing() {
  const color = useEditorStore((s) => s.color);
  const recentColors = useEditorStore((s) => s.recentColors);
  const setColor = useEditorStore((s) => s.setColor);

  return (
    <div className={styles.ring} role="list" aria-label="Color history">
      {recentColors.map((swatch, i) => (
        <button
          key={`${swatch}-${i}`}
          type="button"
          role="listitem"
          className={styles.ringSwatch}
          style={{
            background: swatch,
            transform: `rotate(${(360 / Math.max(recentColors.length, 1)) * i}deg) translateY(-28px)`,
          }}
          data-active={swatch === color}
          onClick={() => setColor(swatch)}
          title={swatch}
        />
      ))}
      <span className={styles.ringCenter} style={{ background: color }} aria-hidden />
    </div>
  );
}

export function PalettePanel() {
  const color = useEditorStore((s) => s.color);
  const setColor = useEditorStore((s) => s.setColor);
  const importPalette = useEditorStore((s) => s.importPalette);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Palette</span>
        <button
          type="button"
          className={styles.importBtn}
          onClick={() => fileRef.current?.click()}
          title="Import palette file"
        >
          Import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".hex,.gpl,.txt,.pal"
          className={styles.hiddenFile}
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
      </div>

      <ColorHistoryRing />

      <div className={styles.pickerRow}>
        <input
          type="color"
          className={styles.colorInput}
          value={color}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Brush color"
        />
        <span className={styles.hex}>{color}</span>
      </div>

      {(Object.keys(MINECRAFT_PALETTES) as MinecraftPaletteId[]).map((id) => {
        const preset = MINECRAFT_PALETTES[id];
        return (
          <div key={id} className={styles.preset}>
            <span className={styles.presetLabel}>{preset.label}</span>
            <div className={styles.swatches}>
              {preset.colors.map((swatch) => (
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
