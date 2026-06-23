import type { ReactNode } from "react";

import styles from "./AppShell.module.css";

interface AppShellProps {
  titleBar: ReactNode;
  leftPanel: ReactNode;
  center: ReactNode;
  rightPanel: ReactNode;
  statusBar: ReactNode;
}

export function AppShell({
  titleBar,
  leftPanel,
  center,
  rightPanel,
  statusBar,
}: AppShellProps) {
  return (
    <div className={styles.shell}>
      <header className={styles.titleBar}>{titleBar}</header>
      <div className={styles.workspace}>
        <aside className={styles.leftPanel}>{leftPanel}</aside>
        <main className={styles.center}>{center}</main>
        <aside className={styles.rightPanel}>{rightPanel}</aside>
      </div>
      <footer className={styles.statusBar}>{statusBar}</footer>
    </div>
  );
}
