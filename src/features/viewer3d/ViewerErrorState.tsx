import {
  AlertTriangle,
  FileImage,
  FolderSearch,
  MessageSquareWarning,
} from "lucide-react";

import { Icon } from "../../ui/icons/Icon";
import { Button } from "../../ui/primitives/Button";
import styles from "./ViewerErrorState.module.css";

interface ViewerErrorStateProps {
  title: string;
  error: string;
  isTexture?: boolean;
  hasLinkedModels?: boolean;
  onShowFlatPreview?: () => void;
  onPickModel?: () => void;
  onReportIssue?: () => void;
}

export function ViewerErrorState({
  title,
  error,
  isTexture = false,
  hasLinkedModels = false,
  onShowFlatPreview,
  onPickModel,
  onReportIssue,
}: ViewerErrorStateProps) {
  return (
    <div className={styles.wrap} role="alert">
      <div className={styles.icon} aria-hidden>
        <Icon icon={AlertTriangle} size={20} />
      </div>
      <h3 className={styles.title}>{title}</h3>
      <p className={styles.error}>{error}</p>
      <div className={styles.actions}>
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
