import { useCallback, useEffect, useRef, type RefObject } from "react";

import type { CatalogEntry } from "../../ipc/types";
import { CATALOG_GRID_COLS } from "./catalogUtils";

interface UseCatalogKeyboardNavOptions {
  panelRef: RefObject<HTMLDivElement | null>;
  searchRef: RefObject<HTMLInputElement | null>;
  entries: CatalogEntry[];
  focusIndex: number;
  setFocusIndex: (index: number) => void;
  selectEntry: (entry: CatalogEntry) => void;
  scrollToRow: (row: number) => void;
}

export function useCatalogKeyboardNav({
  panelRef,
  searchRef,
  entries,
  focusIndex,
  setFocusIndex,
  selectEntry,
  scrollToRow,
}: UseCatalogKeyboardNavOptions) {
  const keyboardScopeActiveRef = useRef(false);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const onFocusIn = () => {
      keyboardScopeActiveRef.current = true;
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      keyboardScopeActiveRef.current = !!(next && panel.contains(next));
    };
    panel.addEventListener("focusin", onFocusIn);
    panel.addEventListener("focusout", onFocusOut);
    return () => {
      panel.removeEventListener("focusin", onFocusIn);
      panel.removeEventListener("focusout", onFocusOut);
    };
  }, [panelRef]);

  const moveFocus = useCallback(
    (next: number) => {
      if (!entries.length) return;
      const clamped = Math.max(0, Math.min(entries.length - 1, next));
      setFocusIndex(clamped);
      scrollToRow(Math.floor(clamped / CATALOG_GRID_COLS));
    },
    [entries.length, setFocusIndex, scrollToRow],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!keyboardScopeActiveRef.current) return;

      const target = event.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !inField) {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }

      if (!entries.length) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveFocus(focusIndex + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveFocus(focusIndex - 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(focusIndex + CATALOG_GRID_COLS);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(focusIndex - CATALOG_GRID_COLS);
      } else if (event.key === "Home") {
        event.preventDefault();
        moveFocus(0);
      } else if (event.key === "End") {
        event.preventDefault();
        moveFocus(entries.length - 1);
      } else if (event.key === "Enter") {
        const entry = entries[focusIndex];
        if (entry) {
          event.preventDefault();
          selectEntry(entry);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [entries, focusIndex, moveFocus, searchRef, selectEntry]);

  useEffect(() => {
    if (focusIndex >= entries.length) {
      setFocusIndex(Math.max(0, entries.length - 1));
    }
  }, [entries.length, focusIndex, setFocusIndex]);
}
