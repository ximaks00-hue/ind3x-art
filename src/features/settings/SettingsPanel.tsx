import { useEffect, useState } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { ipc } from "../../ipc/client";
import { downloadShortcutsExport } from "../../lib/shortcuts";
import { useSettingsStore, type Theme } from "../../state/settingsStore";
import { Button } from "../../ui/primitives";
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

  const [logLines, setLogLines] = useState<string[]>([]);
  const [logFile, setLogFile] = useState<string | undefined>();
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError] = useState<string | undefined>();

  async function refreshLogs() {
    setLogLoading(true);
    setLogError(undefined);
    try {
      const tail = await ipc.readRecentLogs(200);
      setLogLines(tail.lines);
      setLogFile(tail.file ?? undefined);
    } catch (e) {
      setLogError(e instanceof Error ? e.message : String(e));
      setLogLines([]);
    } finally {
      setLogLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      void refreshLogs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [open]);

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
              onChange={(e) => setTheme(e.target.value as Theme)}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="high-contrast">High contrast</option>
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

        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Keyboard</h3>
          <p className={styles.hint}>
            Customizable bindings are planned — export the current defaults as JSON
            (read-only v1).
          </p>
          <Button variant="ghost" onClick={downloadShortcutsExport}>
            Export shortcuts JSON
          </Button>
        </section>

        <section className={styles.section}>
          <div className={styles.logHeader}>
            <h3 className={styles.sectionTitle}>Logs</h3>
            <div className={styles.logActions}>
              <Button
                variant="ghost"
                onClick={() => void refreshLogs()}
                disabled={logLoading}
              >
                {logLoading ? "Loading…" : "Refresh"}
              </Button>
              <Button variant="ghost" onClick={() => void ipc.revealLogDir()}>
                Open folder
              </Button>
            </div>
          </div>
          {logFile ? (
            <p className={styles.hint} title={logFile}>
              {logFile.split(/[/\\]/).pop()}
            </p>
          ) : null}
          {logError ? <p className={styles.logError}>{logError}</p> : null}
          <pre className={styles.logViewer} aria-label="Recent application logs">
            {logLines.length > 0 ? logLines.join("\n") : "No log lines yet."}
          </pre>
        </section>
      </div>
    </div>
  );
}
