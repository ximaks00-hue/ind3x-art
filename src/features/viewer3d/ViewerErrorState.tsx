import {
  AlertTriangle,
  FileImage,
  FolderSearch,
  MessageSquareWarning,
  RotateCcw,
} from "lucide-react";

import { Icon } from "../../ui/icons/Icon";
import { Button } from "../../ui/primitives/Button";
import styles from "./ViewerErrorState.module.css";

interface ViewerErrorStateProps {
  title: string;
  error: string;
  isTexture?: boolean;
  hasLinkedModels?: boolean;
  studioMode?: boolean;
  onShowFlatPreview?: () => void;
  onPickModel?: () => void;
  onReportIssue?: () => void;
  onRetry?: () => void;
  onOpenClassic?: () => void;
}

export function ViewerErrorState({
  title,
  error,
  isTexture = false,
  hasLinkedModels = false,
  studioMode = false,
  onShowFlatPreview,
  onPickModel,
  onReportIssue,
  onRetry,
  onOpenClassic,
}: ViewerErrorStateProps) {
  const heading = studioMode ? "Can't load model" : title;

  return (
    <div className={styles.wrap} role="alert">
      <div className={styles.icon} aria-hidden>
        <Icon icon={AlertTriangle} size={20} />
      </div>
      <h3 className={styles.title}>{heading}</h3>
      <p className={styles.error}>{error}</p>
      <div className={styles.actions}>
        {studioMode && onRetry ? (
          <Button size="sm" onClick={onRetry}>
            <Icon icon={RotateCcw} size={16} />
            Retry
          </Button>
        ) : null}
        {studioMode && onOpenClassic ? (
          <Button size="sm" variant="ghost" onClick={onOpenClassic}>
            Open in Classic
          </Button>
        ) : null}
        {(isTexture || onShowFlatPreview) && (
          <Button size="sm" onClick={onShowFlatPreview} disabled={!onShowFlatPreview}>
            <Icon icon={FileImage} size={16} />
            Show flat preview
          </Button>
        )}
        {hasLinkedModels && (
          <Button size="sm" onClick={onPickModel} disabled={!onPickModel}>
            <Icon icon={FolderSearch} size={16} />
            Pick model
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={onReportIssue}
          disabled={!onReportIssue}
        >
          <Icon icon={MessageSquareWarning} size={16} />
          Report issue
        </Button>
      </div>
    </div>
  );
}
