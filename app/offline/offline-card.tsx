"use client";

import { WifiOff } from "lucide-react";
import { Surface } from "@/components/ui/surface";
import { useT } from "@/lib/i18n/context";
import { offlineCopy } from "@/lib/i18n/offline";

// Client-side on purpose: the service worker replays this page from its
// precache, so a server-rendered locale would be frozen at precache time. The
// provider re-reads the cookie on mount, which is what makes the language
// correct here.
export default function OfflineCard() {
  const t = useT(offlineCopy);
  return (
    <Surface bordered className="flex w-[380px] flex-col items-center gap-4 p-8 text-center">
      <span className="contents [@media(prefers-color-scheme:dark)]:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-light.jpg" alt="" width={48} height={48} style={{ borderRadius: 12 }} />
      </span>
      <span className="hidden [@media(prefers-color-scheme:dark)]:contents">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.jpg" alt="" width={48} height={48} style={{ borderRadius: 12 }} />
      </span>
      <div className="flex items-center gap-2 text-fg-muted">
        <WifiOff size={18} aria-hidden />
        <h1 className="font-display text-lg font-semibold text-fg">{t.title}</h1>
      </div>
      <p className="text-sm text-fg-muted">{t.body}</p>
    </Surface>
  );
}
