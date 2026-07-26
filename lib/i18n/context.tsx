"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./config";

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

  // `initialLocale` is baked into the HTML at render time, which is wrong for
  // any response the service worker replays from its precache -- notably
  // /offline, whose whole job is to be served without a server. Re-read the
  // cookie once on mount so a stale shell corrects itself after hydration.
  // Normally the two already agree and this is a no-op.
  useEffect(() => {
    const fromCookie = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${LOCALE_COOKIE}=`))
      ?.slice(LOCALE_COOKIE.length + 1);
    if (isLocale(fromCookie) && fromCookie !== initialLocale) set(fromCookie);
  }, [initialLocale]);

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
