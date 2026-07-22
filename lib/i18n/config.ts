// Lightweight i18n foundation: a cookie-selected locale plus per-namespace
// dictionaries. No routing/path segments (that would ripple through every
// existing screen); a locale is a plain cookie read server-side and mirrored
// into a client dictionary. Add a locale by extending LOCALES and providing a
// dictionary for each namespace. Existing chat/admin screens are not yet
// translated -- retrofitting them is a separate, incremental follow-up.

// Order here is the display order in the language switcher (pt-BR first, then
// en-US). The default locale is set separately below, not by this order.
export const LOCALES = ["pt", "en"] as const;
export type Locale = (typeof LOCALES)[number];

// en-US is primary (the picoclaw stack's own language); pt-BR ships alongside.
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "locale";

// Endonyms, for the language switcher.
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  pt: "Português",
};

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}
