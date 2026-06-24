import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Clock } from "lucide-react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { fuzzyScore } from "../../features/explorer/fuzzy";
import type { AppCommand } from "../../commands/types";
import { COMMAND_GROUP_LABELS } from "../../commands/types";
import { COMMAND_GROUP_ICONS } from "../../commands/commandGroupIcons";
import { Icon } from "../icons/Icon";
import { useUiStore } from "../../state/uiStore";
import styles from "./CommandPalette.module.css";

interface CommandPaletteProps {
  open: boolean;
  commands: AppCommand[];
  onClose: () => void;
}

function filterCommands(
  commands: AppCommand[],
  query: string,
  recentIds: string[],
): AppCommand[] {
  const trimmed = query.trim();
  const settingsMode = trimmed.startsWith(">");
  const search = settingsMode ? trimmed.slice(1).trim() : trimmed;

  let pool = commands.filter((c) => !c.disabled);
  if (settingsMode) {
    pool = pool.filter((c) => c.settingsQuery || c.group === "settings");
  }

  let filtered: AppCommand[];
  if (!search) {
    filtered = pool;
  } else {
    const scored = pool
      .map((command) => {
        const hay = `${command.label} ${command.keywords ?? ""} ${command.group}`;
        const score = fuzzyScore(search, hay);
        return score !== null ? { command, score } : null;
      })
      .filter((x): x is { command: AppCommand; score: number } => x !== null);

    scored.sort(
      (a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label),
    );
    filtered = scored.map((s) => s.command);
  }

  if (!search && recentIds.length > 0) {
    const recentSet = new Set(recentIds);
    const recent = recentIds
      .map((id) => filtered.find((c) => c.id === id))
      .filter((c): c is AppCommand => c != null);
    const rest = filtered.filter((c) => !recentSet.has(c.id));
    return [...recent, ...rest];
  }

  return filtered;
}

export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  if (!open) return null;
  return <CommandPaletteInner commands={commands} onClose={onClose} />;
}

function CommandPaletteInner({ commands, onClose }: Omit<CommandPaletteProps, "open">) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const trapRef = useFocusTrap(true);
  const listboxId = useId();
  const recentCommandIds = useUiStore((s) => s.recentCommandIds);
  const pushRecentCommand = useUiStore((s) => s.pushRecentCommand);
  const pushToast = useUiStore((s) => s.pushToast);

  const filtered = useMemo(
    () => filterCommands(commands, query, recentCommandIds),
    [commands, query, recentCommandIds],
  );

  const recentIdSet = useMemo(() => new Set(recentCommandIds), [recentCommandIds]);
  const settingsMode = query.trim().startsWith(">");

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  const runCommand = useCallback(
    (command: AppCommand) => {
      pushRecentCommand(command.id);
      void Promise.resolve(command.run())
        .catch((error) => {
          const message = error instanceof Error ? error.message : "Command failed";
          pushToast(message, "error");
        })
        .finally(onClose);
    },
    [pushRecentCommand, pushToast, onClose],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (event.key === "Enter" && filtered[activeIndex]) {
        event.preventDefault();
        runCommand(filtered[activeIndex]);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, activeIndex, onClose, runCommand]);

  let lastGroup: string | null = null;
  const activeCommand = filtered[activeIndex];
  const activeOptionId = activeCommand ? `command-option-${activeCommand.id}` : undefined;

  return (
    <div className={styles.overlay} onMouseDown={onClose} role="presentation">
      <div
        className={styles.dialog}
        ref={trapRef}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          className={styles.input}
          type="search"
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          aria-autocomplete="list"
          placeholder={
            settingsMode ? "Search settings…" : "Type a command…  (> for settings)"
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          aria-label="Search commands"
        />
        <ul className={styles.list} id={listboxId} role="listbox">
          {filtered.length === 0 ? (
            <li className={styles.empty}>
              {settingsMode ? "No matching settings" : "No matching commands"}
            </li>
          ) : (
            filtered.map((command, index) => {
              const showHeader = command.group !== lastGroup;
              lastGroup = command.group;
              const GroupIcon = COMMAND_GROUP_ICONS[command.group];
              const isRecent = !query.trim() && recentIdSet.has(command.id);
              return (
                <li key={command.id}>
                  {showHeader && (
                    <div className={styles.groupLabel}>
                      <Icon icon={GroupIcon} size={16} />
                      {COMMAND_GROUP_LABELS[command.group]}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    id={`command-option-${command.id}`}
                    aria-selected={index === activeIndex}
                    className={index === activeIndex ? styles.itemActive : styles.item}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runCommand(command)}
                  >
                    <span className={styles.itemMain}>
                      {command.icon ? (
                        <Icon icon={command.icon} size={16} />
                      ) : (
                        <Icon icon={GroupIcon} size={16} />
                      )}
                      <span>{command.label}</span>
                      {isRecent && (
                        <span className={styles.recentBadge} title="Recent">
                          <Icon icon={Clock} size={16} />
                        </span>
                      )}
                    </span>
                    {command.shortcut && (
                      <kbd className={styles.shortcut}>{command.shortcut}</kbd>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <div className={styles.footer}>
          <span>↑↓ navigate</span>
          <span>↵ run</span>
          <span>&gt; settings</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
