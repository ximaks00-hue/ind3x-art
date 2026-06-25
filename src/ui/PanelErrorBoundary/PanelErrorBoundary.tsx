import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "../primitives/Button";
import styles from "./PanelErrorBoundary.module.css";

interface PanelErrorBoundaryProps {
  name: string;
  children: ReactNode;
  onRetry?: () => void;
}

interface PanelErrorBoundaryState {
  error: Error | null;
}

export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[${this.props.name}] render error`, error, info.componentStack);
  }

  componentDidUpdate(prevProps: PanelErrorBoundaryProps): void {
    if (this.state.error && prevProps.name !== this.props.name) {
      this.setState({ error: null });
    }
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <div className={styles.wrap} role="alert">
          <h3 className={styles.title}>{this.props.name} failed to render</h3>
          <p className={styles.message}>{error.message || "Unknown error"}</p>
          <Button size="sm" onClick={this.handleRetry}>
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
