/**
 * Locale configuration — Amharic (አማርኛ) alongside English.
 *
 * Ge'ez script is left-to-right, so no RTL mirroring is needed; the only
 * typographic requirement is a font with Ge'ez coverage (Noto Sans Ethiopic —
 * Poppins has none).
 *
 * v1 keeps the locale in a cookie rather than a URL segment, so no route in the
 * app has to move. Adding `/am/...` URLs later is a follow-up (see
 * docs/rewards-and-amharic-design.md).
 */
export const LOCALES = ["en", "am"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Cookie the locale toggle writes; read on every server render. */
export const LOCALE_COOKIE = "dandii_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  am: "አማርኛ",
};

/** Short label for the compact toggle. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  am: "አማ",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return LOCALES.includes(value as Locale);
}
