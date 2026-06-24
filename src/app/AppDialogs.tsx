import { BackupManagerDialog } from "../features/save/BackupManagerDialog";
import { SaveDialog } from "../features/save/SaveDialog";
import { ExportScreenshotDialog } from "../features/export/ExportScreenshotDialog";
import { SettingsPanel } from "../features/settings/SettingsPanel";
import type { SaveDialogSubmit } from "../features/save/SaveDialog";
import type { ScreenshotExportOptions } from "../lib/exportScreenshot";
import type { ProjectHandle } from "../ipc/types";
import { CommandPalette } from "../ui/CommandPalette/CommandPalette";
import { KeyboardShortcutsHelp } from "../ui/KeyboardShortcutsHelp/KeyboardShortcutsHelp";
import { ToastHost } from "../ui/Toast/ToastHost";
import type { AppCommand } from "../commands/types";

interface AppDialogsProps {
  commandPaletteOpen: boolean;
  shortcutsHelpOpen: boolean;
  saveDialogOpen: boolean;
  backupDialogOpen: boolean;
  settingsOpen: boolean;
  exportScreenshotOpen: boolean;
  dirtyCount: number;
  defaultSaveNamespace?: string;
  handle: ProjectHandle | null;
  commands: AppCommand[];
  onCloseCommandPalette: () => void;
  onCloseShortcutsHelp: () => void;
  onCloseSaveDialog: () => void;
  onCloseBackupDialog: () => void;
  onCloseSettings: () => void;
  onCloseExportScreenshot: () => void;
  onExportScreenshot: (options: ScreenshotExportOptions) => void;
  onSaveDialogSubmit: (submit: SaveDialogSubmit) => void;
  onBackupRestored: () => void;
}

export function AppDialogs({
  commandPaletteOpen,
  shortcutsHelpOpen,
  saveDialogOpen,
  backupDialogOpen,
  settingsOpen,
  exportScreenshotOpen,
  dirtyCount,
  defaultSaveNamespace,
  handle,
  commands,
  onCloseCommandPalette,
  onCloseShortcutsHelp,
  onCloseSaveDialog,
  onCloseBackupDialog,
  onCloseSettings,
  onCloseExportScreenshot,
  onExportScreenshot,
  onSaveDialogSubmit,
  onBackupRestored,
}: AppDialogsProps) {
  return (
    <>
      <CommandPalette
        open={commandPaletteOpen}
        commands={commands}
        onClose={onCloseCommandPalette}
      />
      <KeyboardShortcutsHelp open={shortcutsHelpOpen} onClose={onCloseShortcutsHelp} />
      <SaveDialog
        open={saveDialogOpen}
        dirtyCount={dirtyCount}
        defaultNamespace={defaultSaveNamespace}
        onClose={onCloseSaveDialog}
        onSubmit={onSaveDialogSubmit}
      />
      <BackupManagerDialog
        open={backupDialogOpen}
        handle={handle}
        onClose={onCloseBackupDialog}
        onRestored={onBackupRestored}
      />
      <SettingsPanel open={settingsOpen} onClose={onCloseSettings} />
      <ExportScreenshotDialog
        open={exportScreenshotOpen}
        onClose={onCloseExportScreenshot}
        onExport={onExportScreenshot}
      />
      <ToastHost />
    </>
  );
}
