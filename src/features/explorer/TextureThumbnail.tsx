import { useEffect, useRef, useState } from "react";

import { ipc } from "../../ipc/client";
import { useProjectStore } from "../../state/projectStore";
import styles from "./TextureThumbnail.module.css";

const previewCache = new Map<string, string>();

interface TextureThumbnailProps {
  assetPath: string;
  size?: number;
}

export function TextureThumbnail({ assetPath, size = 24 }: TextureThumbnailProps) {
  const handle = useProjectStore((s) => s.handle);
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(
    () => previewCache.get(assetPath) ?? null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!handle || src || failed) return;

    const el = ref.current;
    if (!el) return;

    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();

        void (async () => {
          try {
            const cached = previewCache.get(assetPath);
            if (cached) {
              if (!cancelled) setSrc(cached);
              return;
            }
            const preview = await ipc.getTexturePreview(handle, assetPath, size * 2);
            const url = `data:image/png;base64,${preview.pngBase64}`;
            previewCache.set(assetPath, url);
            if (!cancelled) setSrc(url);
          } catch {
            if (!cancelled) setFailed(true);
          }
        })();
      },
      { rootMargin: "80px" },
    );

    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [handle, assetPath, size, src, failed]);

  return (
    <div
      ref={ref}
      className={styles.thumb}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        <img src={src} alt="" width={size} height={size} draggable={false} />
      ) : (
        <span className={styles.placeholder} />
      )}
    </div>
  );
}
