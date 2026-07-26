"use client";

import { useEffect, useState } from "react";
import { Download, Share } from "lucide-react";
import { chatCopy } from "@/lib/i18n/chat";
import { useT } from "@/lib/i18n/context";

// The subset of BeforeInstallPromptEvent this component needs. It is not in
// lib.dom.d.ts (non-standard, Chromium-only), so it is declared locally rather
// than cast to `any`.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // `navigator.standalone` is the iOS-only signal; the media query covers the rest.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone === true;
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as a Mac; the touch-point check separates it from a desktop.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// An explicit "Install app" affordance. Users were not finding the browser's own
// menu entry, and on iOS there is no prompt API at all — Safari only offers
// Share → "Add to Home Screen", which is why people ended up with a plain
// bookmark instead of an installed app (pwa-installability).
//
// Chromium fires `beforeinstallprompt` only when the app actually MEETS the
// install criteria, so this button doubles as a live signal: if it never appears
// on a supported browser, the manifest or service worker is still failing.
export default function InstallAppButton() {
  const t = useT(chatCopy);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showIosHelp, setShowIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    const onBeforeInstall = (e: Event) => {
      // Suppress the browser's own mini-infobar so the choice lives here.
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already running as an installed app: nothing to offer.
  if (installed) return null;

  const iosOnly = !promptEvent && isIOS();
  if (!promptEvent && !iosOnly) return null;

  async function onInstall() {
    if (!promptEvent) {
      setShowIosHelp((v) => !v);
      return;
    }
    await promptEvent.prompt();
    await promptEvent.userChoice;
    // The event is single-use: drop it either way so the button doesn't reoffer a
    // prompt the browser will refuse.
    setPromptEvent(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onInstall}
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-fg-muted transition-colors hover:bg-elevated/60 hover:text-fg"
      >
        {iosOnly ? (
          <Share size={16} className="shrink-0" aria-hidden />
        ) : (
          <Download size={16} className="shrink-0" aria-hidden />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{t.install.action}</span>
      </button>

      {showIosHelp && (
        <p className="px-2 pb-1 text-[11px] leading-relaxed text-fg-muted">
          {t.install.iosHelpBefore}
          <strong className="text-fg">{t.install.iosShare}</strong>
          {t.install.iosHelpMiddle}
          <strong className="text-fg">{t.install.iosAddToHome}</strong>
          {t.install.iosHelpAfter}
        </p>
      )}
    </div>
  );
}
