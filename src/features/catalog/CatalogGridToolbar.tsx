import { useSettingsStore } from "../../state/settingsStore";
import { useProjectStore } from "../../state/projectStore";
import { CATALOG_LANGUAGE_OPTIONS } from "./catalogLanguageOptions";
import { useCatalogLanguageSwitch } from "./useCatalogLanguageSwitch";
import styles from "./CatalogGridToolbar.module.css";

export function CatalogGridToolbar() {
  const handle = useProjectStore((s) => s.handle);
  const showLabels = useSettingsStore((s) => s.catalogShowCellLabels);
  const setShowLabels = useSettingsStore((s) => s.setCatalogShowCellLabels);
  const { catalogLanguage, switchLanguage, busy } = useCatalogLanguageSwitch();

  return (
    <div className={styles.toolbar} data-tour="tour-catalog-grid-toolbar">
      <div className={styles.group}>
        <label className={styles.groupLabel} htmlFor="catalog-panel-language">
          Lang
        </label>
        <select
          id="catalog-panel-language"
          className={styles.select}
          value={catalogLanguage}
          disabled={!handle || busy}
          aria-label="Catalog display language"
          title="Rebuilds catalog names for the selected language"
          onChange={(e) => void switchLanguage(e.target.value)}
        >
          {CATALOG_LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.shortLabel}
            </option>
          ))}
        </select>
      </div>

      <label className={styles.toggle} title="Show display names under catalog cells">
        <input
          type="checkbox"
          checked={showLabels}
          disabled={!handle}
          onChange={(e) => setShowLabels(e.target.checked)}
        />
        Labels
      </label>

      <span className={styles.spacer} aria-hidden />
    </div>
  );
}
