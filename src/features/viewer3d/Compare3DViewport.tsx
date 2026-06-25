import { useId, type ComponentProps } from "react";

import type { ProjectHandle, RenderableModel } from "../../ipc/types";
import { Scene3D } from "./Scene3D";
import { useCompareBeforeSnapshot } from "./useCompareBeforeSnapshot";
import styles from "./Compare3DViewport.module.css";

type Scene3DProps = ComponentProps<typeof Scene3D>;

interface Compare3DViewportProps {
  beforeModel: RenderableModel;
  afterModel: RenderableModel;
  handle: ProjectHandle;
  className?: string;
  sceneProps?: Omit<Scene3DProps, "model" | "handle">;
}

/** Side-by-side 3D compare: static snapshot for "before", one live Scene3D for "after". */
export function Compare3DViewport({
  beforeModel,
  afterModel,
  handle,
  className,
  sceneProps,
}: Compare3DViewportProps) {
  const { src, loading } = useCompareBeforeSnapshot(handle, beforeModel, true);
  const beforePaneId = useId();
  const afterPaneId = useId();
  const beforeLabelId = useId();
  const afterLabelId = useId();

  return (
    <div className={className ?? styles.comparator3d}>
      <div
        id={beforePaneId}
        className={styles.comparatorPane}
        aria-labelledby={beforeLabelId}
      >
        <span id={beforeLabelId} className={styles.comparatorLabel}>
          Before
        </span>
        {loading ? (
          <div className={styles.compareLoading} role="status" aria-label="Loading before snapshot">
            <div className={styles.compareSkeleton} aria-hidden>
              <span className={styles.skeletonFace} data-face="top" />
              <span className={styles.skeletonFace} data-face="front" />
              <span className={styles.skeletonFace} data-face="side" />
            </div>
          </div>
        ) : src ? (
          <img className={styles.compareSnapshot} src={src} alt="Before" draggable={false} />
        ) : null}
      </div>
      <div className={styles.comparatorDivider} aria-hidden>
        <span className={styles.dividerHandle} />
      </div>
      <div
        id={afterPaneId}
        className={styles.comparatorPane}
        aria-labelledby={afterLabelId}
      >
        <span id={afterLabelId} className={styles.comparatorLabel}>
          After
        </span>
        <Scene3D model={afterModel} handle={handle} {...sceneProps} />
      </div>
    </div>
  );
}
