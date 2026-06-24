import { useEffect, useMemo, useState } from "react";

import type { CatalogEntry } from "../../ipc/types";
import {
  getOriginalTextureCanvas,
  getTextureCanvas,
  isTextureDirty,
  useDocumentRevision,
} from "../editor/documentStore";
import { catalogEntryIsDirty } from "./catalogUtils";
import styles from "./CatalogCellCompare.module.css";

interface CatalogCellCompareProps {
  entry: CatalogEntry;
  active: boolean;
}

function canvasThumb(canvas: HTMLCanvasElement, maxSize: number): string {
  const scale = Math.min(1, maxSize / Math.max(canvas.width, canvas.height));
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, width, height);
  return out.toDataURL("image/png");
}

export function CatalogCellCompare({ entry, active }: CatalogCellCompareProps) {
  const revision = useDocumentRevision();
  const dirty = catalogEntryIsDirty(entry);
  const texturePath = useMemo(
    () => entry.texturePaths.find((path) => isTextureDirty(path)) ?? entry.texturePaths[0],
    [entry.texturePaths, revision],
  );
  const [urls, setUrls] = useState<{ before: string; after: string } | null>(null);

  useEffect(() => {
    if (!active || !dirty || !texturePath) {
      setUrls(null);
      return;
    }
    const beforeCanvas = getOriginalTextureCanvas(texturePath);
    const afterCanvas = getTextureCanvas(texturePath);
    if (!beforeCanvas || !afterCanvas) {
      setUrls(null);
      return;
    }
    setUrls({
      before: canvasThumb(beforeCanvas, 40),
      after: canvasThumb(afterCanvas, 40),
    });
  }, [active, dirty, texturePath, revision]);

  if (!active || !dirty || !urls) return null;

  return (
    <span className={styles.compare} aria-label="Before and after compare" title="Before / after">
      <img src={urls.before} alt="" className={styles.before} draggable={false} />
      <img src={urls.after} alt="" className={styles.after} draggable={false} />
      <span className={styles.divider} aria-hidden />
    </span>
  );
}
