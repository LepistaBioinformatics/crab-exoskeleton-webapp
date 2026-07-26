"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "./config";

// The landing page can hold its locale in plain useState because it owns its
// whole tree. Every other screen is a forest of sibling client components
// (drawers, panels, rows), so the locale travels through context instead of
// props. The value still originates server-side, from the same cookie.

type Ctx = { locale: Locale; setLocale: (next: Locale) => void };

const LocaleCtx = createContext<Ctx>({ locale: DEFAULT_LOCALE, setLocale: () => {} });

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, set] = useState<Locale>(initialLocale);
  const router = useRouter();

  // State and refresh do different jobs and both are needed: the state swap
  // re-renders client copy immediately, while router.refresh() re-runs the
  // server layout so <html lang> and generateMetadata() follow along.
  //
  // Stable identity matters: Landing attaches its `lbl-locale-change` listener
  // once, with an empty dep array, and calls this from inside it.
  const setLocale = useCallback(
    (next: Locale) => {
      set(next);
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    },
    [router],
  );

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useLocale() {
  return useContext(LocaleCtx);
}

// The accessor every screen uses. Mirrors the landing's `landingCopy[locale]`,
// just without threading the locale through props.
export function useT<T>(copy: Record<Locale, T>): T {
  return copy[useContext(LocaleCtx).locale];
}
