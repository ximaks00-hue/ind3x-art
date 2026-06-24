import { useCallback, useEffect, useState } from "react";

import {
  createProjectBackup,
  getSaveJournal,
  listProjectBackups,
  restoreBackup,
} from "../../app/services/backupService";
import type { BackupInfo, ProjectHandle, SaveJournalEntry } from "../../ipc/types";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import styles from "./BackupManagerDialog.module.css";

interface Props {
  open: boolean;
  handle: ProjectHandle | null;
  onClose: () => void;
  onRestored: () => void;
}

export function BackupManagerDialog({ open, handle, onClose, onRestored }: Props) {
  const trapRef = useFocusTrap(open);
  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal aria-label="Backup Manager">
      <div className={styles.dialog} ref={trapRef}>
        <BackupManagerContent
          key={handle?.id ?? "none"}
          handle={handle}
          onClose={onClose}
          onRestored={onRestored}
        />
      </div>
    </div>
  );
}

function BackupManagerContent({
  handle,
  onClose,
  onRestored,
}: {
  handle: ProjectHandle | null;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [journal, setJournal] = useState<SaveJournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (showSpinner = true) => {
      if (!handle) {
        setBackups([]);
        setJournal([]);
        setLoading(false);
        return;
      }
      if (showSpinner) setLoading(true);
      try {
        const [b, j] = await Promise.all([
          listProjectBackups(handle),
          getSaveJournal(handle),
        ]);
        setBackups(b);
        setJournal([...j].reverse());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load backups");
      } finally {
        setLoading(false);
      }
    },
    [handle],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!handle) {
        if (!cancelled) {
          setBackups([]);
          setJournal([]);
          setLoading(false);
        }
        return;
      }
      try {
        const [b, j] = await Promise.all([
          listProjectBackups(handle),
          getSaveJournal(handle),
        ]);
        if (!cancelled) {
          setBackups(b);
          setJournal([...j].reverse());
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load backups");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const handleRestore = useCallback(
    async (backupId: string, backupPath: string) => {
      if (!handle) return;
      setRestoring(backupId);
      try {
        await restoreBackup(handle, backupId, backupPath);
        onRestored();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Restore failed");
      } finally {
        setRestoring(null);
      }
    },
    [handle, onRestored, onClose],
  );

  const fmt = (ts: number) =>
    new Date(ts * 1000).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "medium",
    });

  return (
    <>
      <div className={styles.header}>
        <h2 className={styles.title}>Backup Manager</h2>
        <button
          type="button"
          className={styles.createBtn}
          disabled={!handle || loading}
          onClick={async () => {
            if (!handle) return;
            setLoading(true);
            try {
              await createProjectBackup(handle);
              await loadData();
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setLoading(false);
            }
          }}
        >
          + Create Backup
        </button>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading ? (
        <div className={styles.loading}>
          <span className={styles.skeleton} style={{ width: "60%" }} />
          <span className={styles.skeleton} style={{ width: "80%" }} />
          <span className={styles.skeleton} style={{ width: "50%" }} />
        </div>
      ) : (
        <>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Available Backups ({backups.length})</h3>
            {backups.length === 0 ? (
              <p className={styles.empty}>No backups found.</p>
            ) : (
              <ul className={styles.list}>
                {backups.map((b) => (
                  <li key={b.id ?? b.path} className={styles.item}>
                    <div className={styles.itemInfo}>
                      <span className={styles.label}>{b.label}</span>
                      <span className={styles.meta}>{fmt(b.createdAt)}</span>
                      <span className={styles.meta}>{b.kind}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.restoreBtn}
                      disabled={restoring === (b.id ?? b.path)}
                      onClick={() => void handleRestore(b.id ?? b.path, b.path)}
                    >
                      {restoring === (b.id ?? b.path) ? "Restoring…" : "Restore"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>Save Journal ({journal.length})</h3>
            {journal.length === 0 ? (
              <p className={styles.empty}>No save journal entries.</p>
            ) : (
              <ul className={styles.list}>
                {journal.map((j, i) => (
                  <li key={`${j.timestamp}-${i}`} className={styles.item}>
                    <div className={styles.itemInfo}>
                      <span className={styles.label}>{j.mode}</span>
                      <span className={styles.meta}>
                        {new Date(j.timestamp * 1000).toLocaleString()}
                      </span>
                      <span className={styles.meta}>{j.savedPaths.length} file(s)</span>
                      {j.backupPath && (
                        <button
                          type="button"
                          className={styles.restoreSmall}
                          onClick={() => void handleRestore(j.backupPath!, j.backupPath!)}
                          disabled={restoring === j.backupPath}
                        >
                          ↩ Restore
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
