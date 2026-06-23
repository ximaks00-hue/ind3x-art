import { useSettingsStore } from "../../state/settingsStore";
import styles from "./TitleBar.module.css";

interface TitleBarProps {
  onOpenJar?: () => void;
  onOpenFolder?: () => void;
  onSave?: () => void;
  onOpenCommands?: () => void;
  opening?: boolean;
  saving?: boolean;
  dirtyCount?: number;
}

export function TitleBar({
  onOpenJar,
  onOpenFolder,
  onSave,
  onOpenCommands,
  opening = false,
  saving = false,
  dirtyCount = 0,
}: TitleBarProps) {
  const { theme, toggleTheme } = useSettingsStore();

  return (
    <div className={styles.bar}>
      <div className={styles.brand}>
        <span className={styles.logoMark} aria-hidden />
        <div className={styles.brandText}>
          <span className={styles.name}>inD3X Art</span>
          <span className={styles.tagline}>Minecraft Asset Studio</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.buttonGhost}
          onClick={onOpenCommands}
          title="Command palette (Ctrl+K)"
        >
          Commands
        </button>
        <button
          type="button"
          className={dirtyCount > 0 ? styles.buttonSave : styles.buttonGhost}
          onClick={onSave}
          disabled={opening || saving || dirtyCount === 0}
          title="Save textures (Ctrl+S)"
        >
          {saving ? "Saving…" : dirtyCount > 0 ? `Save (${dirtyCount})` : "Save"}
        </button>
        <button
          type="button"
          className={styles.buttonPrimary}
          onClick={onOpenJar}
          disabled={opening || saving}
        >
          {opening ? "Opening…" : "Open JAR"}
        </button>
        <button
          type="button"
          className={styles.buttonGhost}
          onClick={onOpenFolder}
          disabled={opening || saving}
        >
          Open Folder
        </button>
        <button
          type="button"
          className={styles.buttonGhost}
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "Light" : "Dark"}
        </button>
      </div>
    </div>
  );
}
