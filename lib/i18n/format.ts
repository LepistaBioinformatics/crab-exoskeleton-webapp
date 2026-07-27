import type { Locale } from "./config";

// Date/number formatting follows the chosen app locale, not the browser's.
// A pt-BR reader on an en-US machine was getting "7/26/2026" next to
// Portuguese copy; Intl needs the full BCP 47 tag, which our two-letter
// Locale isn't.
export const BCP47: Record<Locale, string> = {
  en: "en-US",
  pt: "pt-BR",
};
