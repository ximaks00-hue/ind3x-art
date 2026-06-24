import { Component, type ErrorInfo, type ReactNode } from "react";

import { readRecentLogs } from "../../app/services/projectService";
import { Button } from "../primitives/Button";
import styles from "./AppErrorBoundary.module.css";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  logPreview: string | null;
  loadingLogs: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = {
    error: null,
    logPreview: null,
    loadingLogs: false,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[App] unhandled render error", error, info.componentStack);
    void this.loadLogs();
  }

  private loadLogs = async (): Promise<void> => {
    this.setState({ loadingLogs: true });
    try {
      const tail = await readRecentLogs(80);
      const preview = tail.lines.slice(-12).join("\n");
      this.setState({ logPreview: preview || "No recent log lines." });
    } catch {
      this.setState({ logPreview: "Failed to load recent logs." });
    } finally {
      this.setState({ loadingLogs: false });
    }
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error, logPreview, loadingLogs } = this.state;
    if (!error) return this.props.children;

    return (
      <div className={styles.wrap} role="alert">
        <h1 className={styles.title}>inD3X Art encountered an error</h1>
        <p className={styles.message}>{error.message || "Unknown error"}</p>
        <div className={styles.actions}>
          <Button size="sm" onClick={this.handleReload}>
            Reload app
          </Button>
        </div>
        <div className={styles.logs}>
          <h2 className={styles.logsTitle}>Recent logs</h2>
          {loadingLogs ? (
            <p className={styles.logsHint}>Loading logs…</p>
          ) : (
            <pre className={styles.logsBody}>{logPreview}</pre>
          )}
        </div>
      </div>
    );
  }
}
