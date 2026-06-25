import { useSettingsStore } from "../../state/settingsStore";
import type { MiniSceneSize } from "./miniSceneLayout";
import { IconButton } from "../../ui/primitives/IconButton";
import { Select } from "../../ui/primitives/Select";
import styles from "./MiniSceneControl.module.css";

export function MiniSceneControl() {
  const enabled = useSettingsStore((s) => s.miniSceneEnabled);
  const size = useSettingsStore((s) => s.miniSceneSize);
  const setEnabled = useSettingsStore((s) => s.setMiniSceneEnabled);
  const setSize = useSettingsStore((s) => s.setMiniSceneSize);

  return (
    <div className={styles.wrap} role="group" aria-label="Test scene">
      <IconButton
        label="Toggle tiled test scene around the active block"
        className={enabled ? styles.btnActive : styles.btn}
        onClick={() => setEnabled(!enabled)}
      >
        Tiles
      </IconButton>
      {enabled ? (
        <Select
          className={styles.select}
          value={String(size)}
          aria-label="Test scene grid size"
          onChange={(e) => setSize(Number(e.target.value) as MiniSceneSize)}
        >
          <option value="2">2×2</option>
          <option value="3">3×3</option>
        </Select>
      ) : null}
    </div>
  );
}
