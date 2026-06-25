import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type RefCallback,
} from "react";

export type RovingOrientation = "horizontal" | "vertical";

export interface UseRovingTabindexOptions {
  orientation?: RovingOrientation;
  loop?: boolean;
  /** When true, moving focus also invokes `onActivate` (tablist-style). */
  activateOnFocus?: boolean;
  onActivate?: (index: number) => void;
  /** Called when keyboard navigation moves focus to another item. */
  onIndexChange?: (index: number) => void;
}

/**
 * Roving tabindex for toolbars and tablists: Arrow keys, Home, and End move focus
 * while only the active item stays in the tab order.
 */
export function useRovingTabindex(
  itemCount: number,
  activeIndex: number,
  options: UseRovingTabindexOptions = {},
) {
  const {
    orientation = "horizontal",
    loop = true,
    activateOnFocus = false,
    onActivate,
    onIndexChange,
  } = options;

  const itemRefs = useRef<Array<HTMLElement | null>>([]);
  const activeIndexRef = useRef(activeIndex);

  useEffect(() => {
    itemRefs.current = itemRefs.current.slice(0, itemCount);
  }, [itemCount]);

  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const setItemRef = useCallback(
    (index: number): RefCallback<HTMLElement> =>
      (element) => {
        itemRefs.current[index] = element;
      },
    [],
  );

  const focusItem = useCallback(
    (index: number) => {
      if (itemCount === 0) return;
      const clamped = Math.max(0, Math.min(index, itemCount - 1));
      itemRefs.current[clamped]?.focus();
    },
    [itemCount],
  );

  const moveTo = useCallback(
    (next: number) => {
      if (itemCount === 0) return;
      let index = next;
      if (loop) {
        index = ((next % itemCount) + itemCount) % itemCount;
      } else {
        index = Math.max(0, Math.min(next, itemCount - 1));
      }
      if (activateOnFocus) {
        onActivate?.(index);
      }
      activeIndexRef.current = index;
      onIndexChange?.(index);
      focusItem(index);
    },
    [itemCount, loop, activateOnFocus, onActivate, onIndexChange, focusItem],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (itemCount === 0) return;

      const current = activeIndexRef.current;
      const prevKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";

      if (event.key === prevKey) {
        event.preventDefault();
        moveTo(current - 1);
      } else if (event.key === nextKey) {
        event.preventDefault();
        moveTo(current + 1);
      } else if (event.key === "Home") {
        event.preventDefault();
        moveTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        moveTo(itemCount - 1);
      }
    },
    [itemCount, orientation, moveTo],
  );

  const getTabIndex = useCallback(
    (index: number) => (index === activeIndex ? 0 : -1),
    [activeIndex],
  );

  return { setItemRef, onKeyDown, getTabIndex, focusItem };
}
