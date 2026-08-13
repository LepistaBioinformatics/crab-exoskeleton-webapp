import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk, Space_Mono } from "next/font/google";
import { getAppName, DEFAULT_APP_NAME } from "@/lib/db";
import { getLocale } from "@/lib/i18n/server";
import { BCP47 } from "@/lib/i18n/format";
import { commonCopy } from "@/lib/i18n/common";
import { LocaleProvider } from "@/lib/i18n/context";
import SwRegister from "./sw-register";
import "./globals.css";

// Lepista Bioinformatics Lab design system typography
// (https://lepista.com.br/design-system.md): display / body / mono, each
// self-hosted via next/font. Exposed as --ff-* CSS variables and wired into
// Tailwind's font-{display,sans,mono} utilities in globals.css.
const display = Bricolage_Grotesque({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--ff-display",
});

const sans = Hanken_Grotesk({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
  variable: "--ff-sans",
});

const mono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--ff-mono",
});

// Title is dynamic so a rebrand flows into the document title and the PWA
// (generateMetadata reads the branding name server-side). The rest of the head
// wiring -- manifest link, apple-touch-icon, apple-mobile-web-app metas -- is
// static and points at the branding endpoints.
export async function generateMetadata(): Promise<Metadata> {
  // The DB is unreachable during build-time prerender (the build container has
  // no Postgres); fall back to the default so static pages like /signin export.
  // At runtime the query succeeds and a rebrand flows into the title.
  let appName = DEFAULT_APP_NAME;
  try {
    appName = await getAppName();
  } catch {
    // keep the default
  }
  const t = commonCopy[await getLocale()];
  return {
    title: `${appName} ${t.metadata.titleSuffix}`,
    // Derived from branding, not hardcoded: the old literal named this project in
    // the <meta> of every rebranded deployment.
    description: `${appName} — ${t.metadata.description}`,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: appName,
    },
    // Both point at the SQUARE app icon, not the wide wordmark logo: iOS renders
    // apple-touch-icon on the home screen at a fixed square, and a 1408x768 JPEG
    // came out letterboxed (pwa-installability).
    icons: {
      icon: "/api/branding/logo/icon",
      apple: "/api/branding/logo/icon",
    },
  };
}

export const viewport: Viewport = {
  // The soft keyboard must SHRINK the layout viewport, not just offset the visual one.
  //
  // `resizes-visual` is the default, and under it the keyboard leaves the layout viewport
  // at full height and scrolls it to keep the focused input in view — which pushed the
  // mobile top bar off the top of the screen, reachable only by scrolling back. The shell
  // is a fixed-height column, so it had no scroll of its own to fix that with, and
  // `position: sticky` could not see it either: sticky tracks a scroll CONTAINER, and here
  // the thing moving is the viewport.
  //
  // `resizes-content` makes the keyboard reduce the viewport instead, so `h-dvh` on the
  // shell resolves to the space actually visible and nothing needs to scroll.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#14171a" },
  ],
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <html lang={BCP47[locale]} className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="bg-bg text-fg font-sans antialiased">
        <LocaleProvider initialLocale={locale}>{children}</LocaleProvider>
        <SwRegister />
      </body>
    </html>
  );
}
