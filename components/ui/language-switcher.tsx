"use client";

import { LOCALES, LOCALE_NAMES, type Locale } from "@/lib/i18n/config";
import { useLocale, useT } from "@/lib/i18n/context";
import { commonCopy } from "@/lib/i18n/common";
import { cn } from "@/lib/cn";

// The authed screens have no equivalent of the landing's embedded brand bar,
// so they get their own toggle. Same two-button group, same cookie -- switching
// here and switching on the landing are the same action.
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT(commonCopy);

  return (
    <div
      role="group"
      aria-label={t.language.label}
      className={cn("inline-flex items-center gap-0.5 rounded-lg border border-brand/30 p-0.5", className)}
    >
      {LOCALES.map((l: Locale) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          aria-pressed={l === locale}
          className={cn(
            "rounded-md px-2 py-0.5 text-xs font-semibold uppercase transition-colors",
            l === locale ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          {l}
          <span className="sr-only"> — {LOCALE_NAMES[l]}</span>
        </button>
      ))}
    </div>
  );
}
