import { useEffect, useRef, useState } from "react";

import { ipc } from "../../ipc/client";
import { useProjectStore } from "../../state/projectStore";
import { useSettingsStore } from "../../state/settingsStore";
import { getThumbnailCache } from "./thumbnailCache";
import styles from "./TextureThumbnail.module.css";

interface TextureThumbnailProps {
  assetPath: string;
  size?: number;
}

export function TextureThumbnail({ assetPath, size = 24 }: TextureThumbnailProps) {
  const handle = useProjectStore((s) => s.handle);
  const cacheLimit = useSettingsStore((s) => s.textureCacheLimit);
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(
    () => getThumbnailCache(cacheLimit).get(assetPath) ?? null,
  );
  const [loaded, setLoaded] = useState(Boolean(src));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!handle || src || failed) return;

    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const cache = getThumbnailCache(cacheLimit);

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();

        void (async () => {
          try {
            const cached = cache.get(assetPath);
            if (cached) {
              if (!cancelled) {
                setSrc(cached);
                setLoaded(true);
              }
              return;
            }
            const preview = await ipc.getTexturePreview(handle, assetPath, size * 2);
            const url = `data:image/png;base64,${preview.pngBase64}`;
            cache.set(assetPath, url);
            if (!cancelled) {
              setSrc(url);
              setLoaded(true);
            }
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
  }, [handle, assetPath, size, src, failed, cacheLimit]);

  return (
    <div
      ref={ref}
      className={styles.thumb}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className={loaded ? styles.fadeIn : undefined}
        />
      ) : (
        <span className={styles.placeholder} />
      )}
    </div>
  );
}
