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
  const entriesRef = useRef(entries);
  const focusIndexRef = useRef(focusIndex);
  const selectEntryRef = useRef(selectEntry);

  entriesRef.current = entries;
  focusIndexRef.current = focusIndex;
  selectEntryRef.current = selectEntry;

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
      const list = entriesRef.current;
      if (!list.length) return;
      const clamped = Math.max(0, Math.min(list.length - 1, next));
      setFocusIndex(clamped);
      scrollToRow(Math.floor(clamped / CATALOG_GRID_COLS));
    },
    [setFocusIndex, scrollToRow],
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

      const list = entriesRef.current;
      if (!list.length) return;

      const currentFocus = focusIndexRef.current;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        moveFocus(currentFocus + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveFocus(currentFocus - 1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveFocus(currentFocus + CATALOG_GRID_COLS);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveFocus(currentFocus - CATALOG_GRID_COLS);
      } else if (event.key === "Home") {
        event.preventDefault();
        moveFocus(0);
      } else if (event.key === "End") {
        event.preventDefault();
        moveFocus(list.length - 1);
      } else if (event.key === "Enter") {
        const entry = list[currentFocus];
        if (entry) {
          event.preventDefault();
          selectEntryRef.current(entry);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveFocus, searchRef]);

  useEffect(() => {
    if (entries.length === 0) {
      if (focusIndex !== 0) setFocusIndex(0);
      return;
    }
    if (focusIndex >= entries.length) {
      setFocusIndex(entries.length - 1);
    }
  }, [entries.length, focusIndex, setFocusIndex]);
}
