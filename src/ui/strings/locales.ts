// The UI languages the application offers. No imports, so a client component and the identity
// module can both take it without pulling in the tables (design.md D1). The database CHECK
// `account_locale_check` mirrors this list.
export const LOCALES = ["de", "en"] as const;

export type Locale = (typeof LOCALES)[number];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// Language-dependent date conventions (design.md D9): day-first in both languages.
export const DATE_LOCALES: Record<Locale, string> = { de: "de-DE", en: "en-GB" };
