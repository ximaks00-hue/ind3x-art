import { useCallback, useRef, useState, type ReactNode } from "react";
import { PanelLeft, PanelRight, PanelLeftClose } from "lucide-react";

import { useSettingsStore } from "../../state/settingsStore";
import { CATALOG_PANEL_WIDTH } from "../../features/catalog/catalogUtils";
import { Icon } from "../icons/Icon";
import styles from "./AppShell.module.css";

interface AppShellProps {
  titleBar: ReactNode;
  leftPanel: ReactNode;
  center: ReactNode;
  rightPanel: ReactNode;
  statusBar: ReactNode;
}

const LEFT_MIN = 220;
const LEFT_MAX = 520;
const RIGHT_MIN = 240;
const RIGHT_MAX = 560;

export function AppShell({
  titleBar,
  leftPanel,
  center,
  rightPanel,
  statusBar,
}: AppShellProps) {
  const storedLeftWidth = useSettingsStore((s) => s.explorerPanelWidth);
  const storedRightWidth = useSettingsStore((s) => s.editorPanelWidth);
  const setExplorerPanelWidth = useSettingsStore((s) => s.setExplorerPanelWidth);
  const setEditorPanelWidth = useSettingsStore((s) => s.setEditorPanelWidth);
  const focusMode = useSettingsStore((s) => s.focusMode);
  const workspaceMode = useSettingsStore((s) => s.workspaceMode);
  const leftCollapsed = useSettingsStore((s) => s.leftPanelCollapsed);
  const rightCollapsed = useSettingsStore((s) => s.rightPanelCollapsed);
  const toggleLeftPanel = useSettingsStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);
  const toggleFocusMode = useSettingsStore((s) => s.toggleFocusMode);

  const leftHidden = focusMode || leftCollapsed;
  const rightHidden = rightCollapsed;
  const studioCatalog = workspaceMode === "studio";

  const [leftWidth, setLeftWidth] = useState(storedLeftWidth);
  const [rightWidth, setRightWidth] = useState(storedRightWidth);
  const effectiveLeftWidth = studioCatalog ? CATALOG_PANEL_WIDTH : leftWidth;
  const leftDragRef = useRef(leftWidth);
  const rightDragRef = useRef(rightWidth);

  const clampLeft = useCallback(
    (width: number) => Math.max(LEFT_MIN, Math.min(LEFT_MAX, width)),
    [],
  );
  const clampRight = useCallback(
    (width: number) => Math.max(RIGHT_MIN, Math.min(RIGHT_MAX, width)),
    [],
  );

  const onLeftResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = leftWidth;
      leftDragRef.current = startWidth;

      const onMove = (e: MouseEvent) => {
        const delta = e.clientX - startX;
        const next = clampLeft(startWidth + delta);
        leftDragRef.current = next;
        setLeftWidth(next);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setExplorerPanelWidth(leftDragRef.current);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [clampLeft, setExplorerPanelWidth, leftWidth],
  );

  const onLeftResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 32 : 8;
      let next = leftWidth;
      if (event.key === "ArrowLeft") next = leftWidth - step;
      else if (event.key === "ArrowRight") next = leftWidth + step;
      else if (event.key === "Home") next = LEFT_MIN;
      else if (event.key === "End") next = LEFT_MAX;
      else return;
      event.preventDefault();
      const clamped = clampLeft(next);
      leftDragRef.current = clamped;
      setLeftWidth(clamped);
      setExplorerPanelWidth(clamped);
    },
    [clampLeft, leftWidth, setExplorerPanelWidth],
  );

  const onRightResizeStart = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = rightWidth;
      rightDragRef.current = startWidth;

      const onMove = (e: MouseEvent) => {
        const delta = startX - e.clientX;
        const next = clampRight(startWidth + delta);
        rightDragRef.current = next;
        setRightWidth(next);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        setEditorPanelWidth(rightDragRef.current);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [clampRight, setEditorPanelWidth, rightWidth],
  );

  const onRightResizeKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = event.shiftKey ? 32 : 8;
      let next = rightWidth;
      if (event.key === "ArrowLeft") next = rightWidth + step;
      else if (event.key === "ArrowRight") next = rightWidth - step;
      else if (event.key === "Home") next = RIGHT_MIN;
      else if (event.key === "End") next = RIGHT_MAX;
      else return;
      event.preventDefault();
      const clamped = clampRight(next);
      rightDragRef.current = clamped;
      setRightWidth(clamped);
      setEditorPanelWidth(clamped);
    },
    [clampRight, rightWidth, setEditorPanelWidth],
  );

  const columns: string[] = [];
  if (!leftHidden) {
    columns.push(`${effectiveLeftWidth}px`, studioCatalog ? "0px" : "5px");
  } else {
    columns.push("var(--panel-rail-width)");
  }
  columns.push("minmax(0, 1fr)");
  if (!rightHidden) {
    columns.push("5px", `${rightWidth}px`);
  } else {
    columns.push("var(--panel-rail-width)");
  }

  return (
    <div className={styles.shell}>
      <header className={styles.titleBar}>{titleBar}</header>
      <div
        className={styles.workspace}
        style={{ gridTemplateColumns: columns.join(" ") }}
      >
        {leftHidden ? (
          <aside className={styles.panelRail} aria-label="Explorer panel collapsed">
            <button
              type="button"
              className={styles.railBtn}
              onClick={() => {
                if (focusMode) toggleFocusMode();
                else toggleLeftPanel();
              }}
              aria-label={focusMode ? "Exit focus mode" : "Show explorer panel"}
              title={focusMode ? "Exit focus mode (Ctrl+\\)" : "Show explorer"}
            >
              <Icon icon={focusMode ? PanelLeftClose : PanelLeft} size={16} />
            </button>
          </aside>
        ) : (
          <aside className={styles.leftPanel}>{leftPanel}</aside>
        )}

        {!leftHidden && !studioCatalog && (
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize explorer panel"
            aria-valuemin={LEFT_MIN}
            aria-valuemax={LEFT_MAX}
            aria-valuenow={leftWidth}
            tabIndex={0}
            onMouseDown={onLeftResizeStart}
            onKeyDown={onLeftResizeKeyDown}
          />
        )}

        <main className={styles.center}>
          {!leftHidden && (
            <button
              type="button"
              className={styles.collapseBtn}
              data-edge="left"
              onClick={toggleFocusMode}
              aria-label="Focus mode — hide explorer"
              title="Focus mode (Ctrl+\\)"
            >
              <Icon icon={PanelLeftClose} size={16} />
            </button>
          )}
          {center}
          {!rightHidden && (
            <button
              type="button"
              className={styles.collapseBtn}
              data-edge="right"
              onClick={toggleRightPanel}
              aria-label="Collapse editor panel"
              title="Collapse editor"
            >
              <Icon icon={PanelRight} size={16} />
            </button>
          )}
        </main>

        {!rightHidden && (
          <div
            className={styles.resizeHandle}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize editor panel"
            aria-valuemin={RIGHT_MIN}
            aria-valuemax={RIGHT_MAX}
            aria-valuenow={rightWidth}
            tabIndex={0}
            onMouseDown={onRightResizeStart}
            onKeyDown={onRightResizeKeyDown}
          />
        )}

        {rightHidden ? (
          <aside className={styles.panelRail} aria-label="Editor panel collapsed">
            <button
              type="button"
              className={styles.railBtn}
              onClick={toggleRightPanel}
              aria-label="Show editor panel"
              title="Show editor"
            >
              <Icon icon={PanelRight} size={16} />
            </button>
          </aside>
        ) : (
          <aside className={styles.rightPanel}>{rightPanel}</aside>
        )}
      </div>
      <footer className={styles.statusBar}>{statusBar}</footer>
    </div>
  );
}
