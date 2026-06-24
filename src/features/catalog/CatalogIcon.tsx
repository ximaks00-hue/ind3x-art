import type { CatalogEntry } from "../../ipc/types";
import { useProjectStore } from "../../state/projectStore";
import { shouldAttemptIconBake } from "./catalogIconRules";
import { useCatalogIconStatus } from "./useCatalogIconPipeline";
import { useSettingsStore } from "../../state/settingsStore";
import styles from "./CatalogIcon.module.css";

interface CatalogIconProps {
  entry: CatalogEntry;
  size?: number;
  fallbackInitial: string;
}

export function CatalogIcon({ entry, size = 40, fallbackInitial }: CatalogIconProps) {
  const handle = useProjectStore((s) => s.handle);
  const mode = useSettingsStore((s) => s.catalogIconMode);
  const { src, status } = useCatalogIconStatus(handle?.id, entry.iconKey);
  const isItem = entry.kind === "item";
  const willBake = shouldAttemptIconBake(entry, mode);
  const showShimmer = status === "baking" || (status === "idle" && willBake && !src);
  const showLowRes = status === "low" && Boolean(src);
  const showLetter = !src && !showShimmer;
  const showCube = showLetter && entry.kind === "block" && !willBake;

  return (
    <span
      className={[styles.slot, isItem ? styles.itemSlot : ""].filter(Boolean).join(" ")}
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
          className={[styles.image, showLowRes ? styles.imageLow : ""]
            .filter(Boolean)
            .join(" ")}
        />
      ) : showShimmer ? (
        <span className={styles.shimmer} />
      ) : showCube ? (
        <span className={styles.cubePlaceholder} />
      ) : showLetter ? (
        <span className={styles.placeholder}>{fallbackInitial}</span>
      ) : null}
    </span>
  );
}
