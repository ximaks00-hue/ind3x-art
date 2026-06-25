import type { RenderableModel } from "../../ipc/types";
import type { SelectedFace } from "../../state/selectionStore";
import { getSharedTextureInfo, sharedTextureBannerText } from "./sharedTextureUsage";
import styles from "./SharedTextureBanner.module.css";

interface SharedTextureBannerProps {
  model: RenderableModel | null;
  selectedFace: SelectedFace | null;
}

export function SharedTextureBanner({ model, selectedFace }: SharedTextureBannerProps) {
  const info = getSharedTextureInfo(model, selectedFace);
  if (!info) return null;

  return (
    <p className={styles.banner} role="status">
      {sharedTextureBannerText(info)}
    </p>
  );
}
