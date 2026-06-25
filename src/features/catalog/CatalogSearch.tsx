import { Search, X } from "lucide-react";

import { Icon } from "../../ui/icons/Icon";
import { Spinner } from "../../ui/primitives/Spinner";
import styles from "./CatalogSearch.module.css";
import { CATALOG_LANGUAGE_OPTIONS } from "./catalogLanguageOptions";

interface CatalogSearchProps {
  value: string;
  onChange: (value: string) => void;
  namespace?: string;
  onNamespaceChange?: (value: string) => void;
  disabled?: boolean;
  searchPending?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  fuzzySearch?: boolean;
  onFuzzySearchChange?: (enabled: boolean) => void;
  showLabels?: boolean;
  onShowLabelsChange?: (enabled: boolean) => void;
  catalogLanguage?: string;
  onCatalogLanguageChange?: (language: string) => void;
  languageBusy?: boolean;
}

export function CatalogSearch({
  value,
  onChange,
  namespace = "",
  onNamespaceChange,
  disabled,
  searchPending = false,
  inputRef,
  fuzzySearch,
  onFuzzySearchChange,
  showLabels,
  onShowLabelsChange,
  catalogLanguage,
  onCatalogLanguageChange,
  languageBusy = false,
}: CatalogSearchProps) {
  const showToolbar =
    onShowLabelsChange != null || onCatalogLanguageChange != null || onFuzzySearchChange != null;

  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
        <div className={styles.searchField}>
          <Icon icon={Search} size={16} className={styles.searchIcon} aria-hidden />
          <input
            ref={inputRef}
            className={styles.input}
            type="search"
            placeholder="Search blocks & items… (/ or Ctrl+F)"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            aria-label="Search catalog"
          />
          {searchPending ? (
            <span className={styles.pendingSpinner} aria-hidden>
              <Spinner />
            </span>
          ) : null}
          {value && !disabled ? (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => onChange("")}
              aria-label="Clear search"
            >
              <Icon icon={X} size={16} aria-hidden />
            </button>
          ) : null}
        </div>
        {showToolbar ? (
          <div className={styles.actions} role="group" aria-label="Catalog display options">
            {onFuzzySearchChange != null ? (
              <button
                type="button"
                className={`chip ${fuzzySearch ? "chip--active" : ""}`}
                aria-pressed={fuzzySearch ?? false}
                disabled={disabled}
                onClick={() => onFuzzySearchChange(!fuzzySearch)}
              >
                Fuzzy
              </button>
            ) : null}
            {onCatalogLanguageChange != null ? (
              <select
                className={styles.langSelect}
                value={catalogLanguage ?? "en_us"}
                disabled={disabled || languageBusy}
                aria-label="Catalog display language"
                title="Rebuilds catalog names for the selected language"
                onChange={(e) => onCatalogLanguageChange(e.target.value)}
              >
                {CATALOG_LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.shortLabel}
                  </option>
                ))}
              </select>
            ) : null}
            {onShowLabelsChange != null ? (
              <button
                type="button"
                className={`chip ${showLabels ? "chip--active" : ""}`}
                title="Show display names under catalog cells"
                aria-pressed={showLabels ?? false}
                disabled={disabled}
                onClick={() => onShowLabelsChange(!showLabels)}
              >
                Labels
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {onNamespaceChange ? (
        <div className={styles.filterRow}>
          <span className={styles.namespaceLabel}>Namespace</span>
          <input
            className={`${styles.input} ${styles.namespacePlain}`}
            type="text"
            placeholder="minecraft, mymod…"
            value={namespace}
            onChange={(e) => onNamespaceChange(e.target.value)}
            disabled={disabled}
            aria-label="Filter namespace"
          />
        </div>
      ) : null}
    </div>
  );
}
