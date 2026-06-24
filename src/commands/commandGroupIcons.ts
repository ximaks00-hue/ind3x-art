import type { LucideIcon } from "lucide-react";
import {
  Download,
  File,
  FolderOpen,
  HelpCircle,
  Image,
  Navigation,
  Palette,
  Settings,
  SlidersHorizontal,
  View,
} from "lucide-react";

import type { CommandGroup } from "../commands/types";

export const COMMAND_GROUP_ICONS: Record<CommandGroup, LucideIcon> = {
  file: FolderOpen,
  view: View,
  editor: Palette,
  navigation: Navigation,
  export: Download,
  recent: File,
  settings: Settings,
  help: HelpCircle,
};

export const SETTINGS_QUERY_ICON = SlidersHorizontal;
export const SCREENSHOT_ICON = Image;
