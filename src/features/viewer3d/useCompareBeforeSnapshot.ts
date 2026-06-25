import { useEffect, useState } from "react";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";

const COMPARE_SNAPSHOT_SIZE = 256;

/** Bakes a static PNG for the compare "before" pane — avoids a second live WebGL context. */
export function useCompareBeforeSnapshot(
  handle: ProjectHandle | null,
  model: RenderableModel | null,
  enabled: boolean,
): { src: string | null; loading: boolean } {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !handle || !model) {
      setSrc(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSrc(null);

    void (async () => {
      try {
        const { bakeCatalogIcon3d } = await import("../catalog/CatalogIconRenderer");
        const url = await bakeCatalogIcon3d(model, handle, COMPARE_SNAPSHOT_SIZE);
        if (!cancelled) {
          setSrc(url);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setSrc(null);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, handle?.id, model]);

  return { src, loading };
}
