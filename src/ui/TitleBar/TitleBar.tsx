import {
  Archive,
  Command,
  Contrast,
  FolderOpen,
  Focus,
  Moon,
  Save,
  Sun,
} from "lucide-react";

import { useWindowChrome } from "../../hooks/useWindowChrome";
import type { Theme, WorkspaceMode } from "../../state/settingsStore";
import { useSettingsStore } from "../../state/settingsStore";
import { Icon } from "../icons/Icon";
import { Button } from "../primitives";
import { WindowControls } from "../WindowControls/WindowControls";
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

const THEME_ICONS: Record<Theme, typeof Sun> = {
  dark: Moon,
  light: Sun,
  "high-contrast": Contrast,
};

const THEME_LABELS: Record<Theme, string> = {
  dark: "Dark theme",
  light: "Light theme",
  "high-contrast": "High contrast theme",
};

export function TitleBar({
  onOpenJar,
  onOpenFolder,
  onSave,
  onOpenCommands,
  opening = false,
  saving = false,
  dirtyCount = 0,
}: TitleBarProps) {
  useWindowChrome();

  const {
    theme,
    cycleTheme,
    toggleFocusMode,
    focusMode,
    workspaceMode,
    setWorkspaceMode,
  } = useSettingsStore();
  const ThemeIcon = THEME_ICONS[theme];

  return (
    <div className={styles.bar}>
      <div className={styles.brand} data-tauri-drag-region>
        <span className={styles.logoMark} aria-hidden />
        <div className={styles.brandText}>
          <span className={styles.name}>inD3X Art</span>
          <span className={styles.tagline}>Minecraft Asset Studio</span>
        </div>
      </div>

      <div className={styles.actions} data-tour="tour-open">
        <div
          className={styles.modeToggle}
          role="group"
          aria-label="Workspace mode"
          data-tour="tour-workspace-mode"
        >
          {(["classic", "studio"] as WorkspaceMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              className={workspaceMode === mode ? styles.modeActive : styles.modeBtn}
              onClick={() => setWorkspaceMode(mode)}
              aria-pressed={workspaceMode === mode}
            >
              {mode === "classic" ? "Classic" : "Studio"}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          className={styles.iconAction}
          onClick={onOpenCommands}
          title="Command palette (Ctrl+K)"
          aria-label="Open command palette"
          data-tour="hint-commands"
        >
          <Icon icon={Command} size={16} />
        </Button>
        <Button
          variant={dirtyCount > 0 ? "default" : "ghost"}
          className={dirtyCount > 0 ? styles.buttonSave : styles.iconAction}
          onClick={onSave}
          disabled={opening || saving || dirtyCount === 0}
          title="Save textures (Ctrl+S)"
          aria-label={dirtyCount > 0 ? `Save ${dirtyCount} textures` : "Save"}
          data-tour="tour-save hint-save"
        >
          <Icon icon={Save} size={16} />
          {dirtyCount > 0 ? dirtyCount : null}
        </Button>
        <Button
          variant="primary"
          className={styles.buttonPrimary}
          onClick={onOpenJar}
          disabled={opening || saving}
          aria-label="Open JAR"
        >
          <Icon icon={Archive} size={16} />
          {opening ? "Opening…" : "Open JAR"}
        </Button>
        <Button
          variant="ghost"
          className={styles.iconAction}
          onClick={onOpenFolder}
          disabled={opening || saving}
          aria-label="Open folder"
        >
          <Icon icon={FolderOpen} size={16} />
          Folder
        </Button>
        <Button
          variant={focusMode ? "default" : "ghost"}
          className={styles.iconAction}
          onClick={toggleFocusMode}
          aria-label="Toggle focus mode"
          title="Focus mode — viewer + editor only (Ctrl+\\)"
        >
          <Icon icon={Focus} size={16} />
        </Button>
        <Button
          variant="ghost"
          className={styles.iconAction}
          onClick={cycleTheme}
          aria-label={THEME_LABELS[theme]}
          title={THEME_LABELS[theme]}
        >
          <Icon icon={ThemeIcon} size={16} />
        </Button>
        <WindowControls />
      </div>
    </div>
  );
}
