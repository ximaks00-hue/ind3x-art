import { useEffect, useState } from "react";

import { canvasToPngBase64Async } from "../editor/textureEncodeWorkerClient";
import { getTexturePreview } from "../../app/services/textureService";
import type { CatalogEntry, ProjectHandle } from "../../ipc/types";
import {
  getTextureCanvas,
  isTextureDirty,
  useDocumentRevision,
} from "../editor/documentStore";
import { Spinner } from "../../ui/primitives/Spinner";
import styles from "./StudioTexturePreview.module.css";

const PREVIEW_SIZE = 256;

function texturePathForEntry(entry: CatalogEntry): string | null {
  return entry.texturePaths[0] ?? entry.studioModelPath ?? entry.sourcePath ?? null;
}

interface StudioTexturePreviewProps {
  entry: CatalogEntry;
  handle: ProjectHandle;
  onTexturePath?: (path: string) => void;
}

export function StudioTexturePreview({
  entry,
  handle,
  onTexturePath,
}: StudioTexturePreviewProps) {
  const texturePath = texturePathForEntry(entry);
  const docRevision = useDocumentRevision();
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(texturePath));

  useEffect(() => {
    if (!texturePath) {
      setSrc(null);
      setError("No texture path for this catalog entry");
      setLoading(false);
      return;
    }

    const dirtyCanvas = getTextureCanvas(texturePath);
    if (dirtyCanvas && isTextureDirty(texturePath)) {
      let cancelled = false;
      setLoading(true);
      void canvasToPngBase64Async(dirtyCanvas).then((pngBase64) => {
        if (cancelled) return;
        setSrc(`data:image/png;base64,${pngBase64}`);
        setError(null);
        setLoading(false);
        onTexturePath?.(texturePath);
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setSrc(null);
    onTexturePath?.(texturePath);

    void (async () => {
      try {
        const preview = await getTexturePreview(handle, texturePath, PREVIEW_SIZE);
        if (cancelled) return;
        setSrc(`data:image/png;base64,${preview.pngBase64}`);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load texture preview");
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [handle, texturePath, entry.id, onTexturePath, docRevision]);

  if (!texturePath) {
    return (
      <div className={styles.wrap}>
        <p className={styles.message}>No texture linked to this entry</p>
      </div>
    );
  }

  return (
    <div className={styles.wrap} data-studio-texture-preview="true">
      {loading ? (
        <div className={styles.loading}>
          <Spinner label="Loading texture…" />
          <span>Loading texture…</span>
        </div>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert">
          <p className={styles.errorTitle}>Texture preview failed</p>
          <p className={styles.errorDetail}>{error}</p>
          <p className={styles.errorPath}>{texturePath}</p>
        </div>
      ) : null}
      {src ? (
        <img
          className={styles.image}
          src={src}
          alt={entry.displayName}
          draggable={false}
        />
      ) : null}
    </div>
  );
}
