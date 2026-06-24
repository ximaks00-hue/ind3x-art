import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import styles from "./ContextMenu.module.css";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  items: ContextMenuItem[];
  x: number;
  y: number;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function menuButtons(menu: HTMLDivElement): HTMLButtonElement[] {
  return Array.from(
    menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])'),
  );
}

function clampPosition(
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } {
  const margin = 8;
  return {
    left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
    top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
  };
}

export function ContextMenu({ items, x, y, onSelect, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition(clampPosition(x, y, width, height));
  }, [x, y, items]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const buttons = menuButtons(menu);
    buttons[0]?.focus();

    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      const enabled = menuButtons(menu);
      if (enabled.length === 0) return;

      const active = document.activeElement;
      const index = enabled.findIndex((btn) => btn === active);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = index < 0 ? 0 : (index + 1) % enabled.length;
        enabled[next].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const next =
          index < 0 ? enabled.length - 1 : (index - 1 + enabled.length) % enabled.length;
        enabled[next].focus();
      } else if (e.key === "Home") {
        e.preventDefault();
        enabled[0].focus();
      } else if (e.key === "End") {
        e.preventDefault();
        enabled[enabled.length - 1].focus();
      } else if (
        e.key === "Enter" &&
        active instanceof HTMLButtonElement &&
        menu.contains(active)
      ) {
        e.preventDefault();
        active.click();
      }
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, items]);

  const menu = (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{
        position: "fixed",
        left: position.left,
        top: position.top,
        zIndex: 2000,
      }}
      role="menu"
    >
      {items.map((item) =>
        item.separator ? (
          <div key={item.id} className={styles.separator} role="separator" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={styles.item}
            disabled={item.disabled}
            onClick={() => {
              if (!item.disabled) {
                onSelect(item.id);
                onClose();
              }
            }}
          >
            {item.icon && <span className={styles.icon}>{item.icon}</span>}
            <span className={styles.label}>{item.label}</span>
            {item.shortcut && <span className={styles.shortcut}>{item.shortcut}</span>}
          </button>
        ),
      )}
    </div>
  );

  return createPortal(menu, document.body);
}
