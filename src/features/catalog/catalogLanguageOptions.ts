export const CATALOG_LANGUAGE_OPTIONS = [
  { value: "en_us", label: "English (US)", shortLabel: "EN" },
  { value: "en_gb", label: "English (UK)", shortLabel: "EN-GB" },
  { value: "ru_ru", label: "Русский", shortLabel: "RU" },
] as const;

export type CatalogLanguageCode = (typeof CATALOG_LANGUAGE_OPTIONS)[number]["value"];
