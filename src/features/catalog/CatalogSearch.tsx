import styles from "./CatalogSearch.module.css";

interface CatalogSearchProps {
  value: string;
  onChange: (value: string) => void;
  namespace?: string;
  onNamespaceChange?: (value: string) => void;
  disabled?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  fuzzySearch?: boolean;
  onFuzzySearchChange?: (enabled: boolean) => void;
}

export function CatalogSearch({
  value,
  onChange,
  namespace = "",
  onNamespaceChange,
  disabled,
  inputRef,
  fuzzySearch,
  onFuzzySearchChange,
}: CatalogSearchProps) {
  return (
    <div className={styles.wrap}>
      <div className={styles.searchRow}>
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
        {onFuzzySearchChange != null ? (
          <label className={styles.fuzzyToggle}>
            <input
              type="checkbox"
              checked={fuzzySearch ?? false}
              onChange={(e) => onFuzzySearchChange(e.target.checked)}
              disabled={disabled}
            />
            Fuzzy
          </label>
        ) : null}
      </div>
      {onNamespaceChange ? (
        <div className={styles.filterRow}>
          <span className={styles.namespaceLabel}>Namespace</span>
          <input
            className={`${styles.input} ${styles.namespaceInput}`}
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
