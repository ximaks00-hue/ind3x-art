import { useEffect, useRef, useState } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { SaveMode } from "../../ipc/types";
import {
  normalizeRelativeAssetPath,
  validateRenameTargetPath,
  validateSaveNamespace,
} from "./savePathValidation";
import styles from "./SaveDialog.module.css";

export interface SaveDialogSubmit {
  mode: SaveMode;
  targetPath?: string;
  namespace?: string;
}

interface SaveDialogProps {
  open: boolean;
  dirtyCount: number;
  defaultNamespace?: string;
  onClose: () => void;
  onSubmit: (options: SaveDialogSubmit) => void;
}

const MODE_LABELS: Record<SaveMode, string> = {
  overwrite: "Overwrite source",
  exportFolder: "Export to folder",
  namespace: "Save to namespace",
  rename: "Rename (current texture)",
};

export function SaveDialog({
  open,
  dirtyCount,
  defaultNamespace,
  onClose,
  onSubmit,
}: SaveDialogProps) {
  const trapRef = useFocusTrap(open);
  if (!open) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.dialog}
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <SaveDialogForm
          key={defaultNamespace ?? "default"}
          dirtyCount={dirtyCount}
          defaultNamespace={defaultNamespace}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
}

function SaveDialogForm({
  dirtyCount,
  defaultNamespace,
  onClose,
  onSubmit,
}: {
  dirtyCount: number;
  defaultNamespace?: string;
  onClose: () => void;
  onSubmit: (options: SaveDialogSubmit) => void;
}) {
  const [mode, setMode] = useState<SaveMode>("overwrite");
  const [namespace, setNamespace] = useState(defaultNamespace ?? "");
  const [renamePath, setRenamePath] = useState("");
  const namespaceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (mode === "namespace") {
      namespaceRef.current?.focus();
    }
  }, [mode]);

  const renameDisabled = dirtyCount !== 1;

  const namespaceError =
    mode === "namespace" && namespace.trim().length > 0
      ? validateSaveNamespace(namespace)
      : null;
  const renameError =
    mode === "rename" && renamePath.trim().length > 0
      ? validateRenameTargetPath(renamePath)
      : null;

  useEffect(() => {
    if (renameDisabled && mode === "rename") {
      setMode("overwrite");
    }
  }, [renameDisabled, mode]);

  const canSubmit =
    mode === "overwrite" ||
    mode === "exportFolder" ||
    (mode === "namespace" && namespace.trim().length > 0 && !namespaceError) ||
    (mode === "rename" && dirtyCount === 1 && renamePath.trim().length > 0 && !renameError);

  return (
    <>
      <header className={styles.header}>
        <h2 id="save-dialog-title" className={styles.dialogTitle}>Save textures</h2>
        <p>{dirtyCount} unsaved texture(s)</p>
      </header>

      <div className={styles.modes}>
        {(Object.keys(MODE_LABELS) as SaveMode[]).map((value) => (
          <label key={value} className={styles.modeOption}>
            <input
              type="radio"
              name="save-mode"
              value={value}
              checked={mode === value}
              disabled={value === "rename" && renameDisabled}
              onChange={() => setMode(value)}
            />
            <span>
              {MODE_LABELS[value]}
              {value === "rename" && renameDisabled ? " (single texture only)" : ""}
            </span>
          </label>
        ))}
      </div>

      {mode === "namespace" && (
        <label className={styles.field}>
          <span>Target namespace</span>
          <input
            ref={namespaceRef}
            value={namespace}
            onChange={(event) => setNamespace(event.target.value)}
            placeholder="create"
            spellCheck={false}
          />
          {namespaceError && <small className={styles.fieldError}>{namespaceError}</small>}
        </label>
      )}

      {mode === "rename" && (
        <label className={styles.field}>
          <span>New asset path</span>
          <input
            value={renamePath}
            onChange={(event) => setRenamePath(event.target.value)}
            placeholder="assets/minecraft/textures/block/stone_v2.png"
            spellCheck={false}
          />
          {renameError ? (
            <small className={styles.fieldError}>{renameError}</small>
          ) : (
            <small>Applies when saving a single dirty texture.</small>
          )}
        </label>
      )}

      {mode === "exportFolder" && (
        <p className={styles.hint}>
          You will pick an export folder after confirming. Paths keep the assets/…
          structure for resource packs.
        </p>
      )}

      <footer className={styles.footer}>
        <button type="button" className={styles.secondary} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={!canSubmit}
          onClick={() =>
            onSubmit({
              mode,
              namespace:
                mode === "namespace" ? namespace.trim().replace(/^\/+|\/+$/g, "") : undefined,
              targetPath:
                mode === "rename"
                  ? (normalizeRelativeAssetPath(renamePath.trim()) ?? undefined)
                  : undefined,
            })
          }
        >
          Continue
        </button>
      </footer>
    </>
  );
}
