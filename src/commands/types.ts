export type CommandGroup =
  | "file"
  | "view"
  | "editor"
  | "navigation"
  | "export"
  | "recent"
  | "help";

export interface AppCommand {
  id: string;
  label: string;
  group: CommandGroup;
  shortcut?: string;
  keywords?: string;
  disabled?: boolean;
  run: () => void | Promise<void>;
}

export const COMMAND_GROUP_LABELS: Record<CommandGroup, string> = {
  file: "File",
  view: "View",
  editor: "Editor",
  navigation: "Navigation",
  export: "Export",
  recent: "Recent",
  help: "Help",
};
