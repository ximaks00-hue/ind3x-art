import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useSettingsStore } from "../../state/settingsStore";
import styles from "./SettingsPanel.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsPanel({ open, onClose }: Props) {
  const trapRef = useFocusTrap(open);
  const {
    theme,
    setTheme,
    textureCacheLimit,
    setTextureCacheLimit,
    modelCacheLimit,
    setModelCacheLimit,
    uiScale,
    setUiScale,
  } = useSettingsStore();

  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal aria-label="Settings">
      <div className={styles.dialog} ref={trapRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>Settings</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Appearance</h3>
          <div className={styles.row}>
            <label className={styles.rowLabel} htmlFor="theme-select">
              Theme
            </label>
            <select
              id="theme-select"
              className={styles.select}
              value={theme}
              onChange={(e) => setTheme(e.target.value as "dark" | "light")}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div className={styles.row}>
            <label className={styles.rowLabel} htmlFor="ui-scale">
              UI Scale
            </label>
            <input
              id="ui-scale"
              type="range"
              min={0.8}
              max={1.5}
              step={0.05}
              value={uiScale}
              className={styles.range}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setUiScale(v);
                document.documentElement.style.setProperty("--ui-scale", String(v));
              }}
            />
            <span className={styles.value}>{(uiScale * 100).toFixed(0)}%</span>
          </div>
        </section>

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Cache Budgets</h3>
          <div className={styles.row}>
            <label className={styles.rowLabel} htmlFor="tex-cache">
              Texture cache (entries)
            </label>
            <input
              id="tex-cache"
              type="number"
              min={64}
              max={4096}
              step={64}
              value={textureCacheLimit}
              className={styles.numberInput}
              onChange={(e) => setTextureCacheLimit(Number(e.target.value))}
            />
          </div>
          <div className={styles.row}>
            <label className={styles.rowLabel} htmlFor="model-cache">
              Model cache (entries)
            </label>
            <input
              id="model-cache"
              type="number"
              min={64}
              max={2048}
              step={64}
              value={modelCacheLimit}
              className={styles.numberInput}
              onChange={(e) => setModelCacheLimit(Number(e.target.value))}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
