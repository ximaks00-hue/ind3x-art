import { useEffect, useMemo, useRef, useState } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { fuzzyScore } from "../../features/explorer/fuzzy";
import type { AppCommand } from "../../commands/types";
import { COMMAND_GROUP_LABELS } from "../../commands/types";
import styles from "./CommandPalette.module.css";

interface CommandPaletteProps {
  open: boolean;
  commands: AppCommand[];
  onClose: () => void;
}

function filterCommands(commands: AppCommand[], query: string): AppCommand[] {
  const q = query.trim();
  if (!q) return commands.filter((c) => !c.disabled);

  const scored = commands
    .filter((c) => !c.disabled)
    .map((command) => {
      const hay = `${command.label} ${command.keywords ?? ""} ${command.group}`;
      const score = fuzzyScore(q, hay);
      return score !== null ? { command, score } : null;
    })
    .filter((x): x is { command: AppCommand; score: number } => x !== null);

  scored.sort(
    (a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label),
  );
  return scored.map((s) => s.command);
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

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

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
        void Promise.resolve(filtered[activeIndex].run()).finally(onClose);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtered, activeIndex, onClose]);

  let lastGroup: string | null = null;

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
          placeholder="Type a command…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          aria-label="Search commands"
        />
        <ul className={styles.list} role="listbox">
          {filtered.length === 0 ? (
            <li className={styles.empty}>No matching commands</li>
          ) : (
            filtered.map((command, index) => {
              const showHeader = command.group !== lastGroup;
              lastGroup = command.group;
              return (
                <li key={command.id}>
                  {showHeader && (
                    <div className={styles.groupLabel}>
                      {COMMAND_GROUP_LABELS[command.group]}
                    </div>
                  )}
                  <button
                    type="button"
                    className={index === activeIndex ? styles.itemActive : styles.item}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      void Promise.resolve(command.run()).finally(onClose);
                    }}
                  >
                    <span>{command.label}</span>
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
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
