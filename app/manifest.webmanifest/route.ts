import { NextResponse } from "next/server";
import { getAppName, getLogo, DEFAULT_APP_NAME } from "@/lib/db";
import { commonCopy } from "@/lib/i18n/common";
import { getLocale } from "@/lib/i18n/server";

// Force-dynamic: this GET takes no request arg and would otherwise be cached /
// prerendered at build (running a DB query at build time). The manifest must
// reflect the live branding app name, so always run per-request.
export const dynamic = "force-dynamic";

// Dynamic PWA manifest.
//
// The icon entries are what installability turns on, and what was wrong before
// (pwa-installability): they declared `192x192` and `512x512` on
// /api/branding/logo/light, which resolves to a 1408x768 wordmark JPEG — not
// square, not the declared size, no `type`, and reached through a 302. Now:
//
//   - the bundled defaults are real square PNGs at their declared sizes;
//   - `purpose: "any"` and `purpose: "maskable"` are SEPARATE entries (the old
//     `"any maskable"` on a wide photo served neither well): the maskable art
//     carries safe-zone padding so a circular mask does not clip it;
//   - a custom brand icon is a dedicated square upload, declared once at 512
//     rather than claiming two sizes it does not have;
//   - every icon URL answers 200 with real bytes.
//
// `id` pins the app identity independently of `start_url`; `description` is what
// Chrome's richer install dialog reads. `screenshots` is deliberately absent —
// there are none to ship, and a fabricated one would misrepresent the app.
const BUNDLED_ICONS = [
  { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
  { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
  {
    src: "/icon-maskable-512.png",
    sizes: "512x512",
    type: "image/png",
    purpose: "maskable",
  },
];

export async function GET() {
  // A DB blip must not 500 the manifest — that alone makes the app
  // uninstallable. Fall back to the defaults, exactly as the root layout does.
  let appName = DEFAULT_APP_NAME;
  try {
    appName = await getAppName();
  } catch {
    // keep the default
  }
  const custom = await getLogo("icon").catch(() => null);
  const t = commonCopy[await getLocale()];

  const icons = custom
    ? [
        { src: "/api/branding/logo/icon", sizes: "512x512", type: custom.type, purpose: "any" },
        { src: "/api/branding/logo/icon", sizes: "512x512", type: custom.type, purpose: "maskable" },
      ]
    : BUNDLED_ICONS;

  const manifest = {
    id: "/",
    name: appName,
    short_name: appName,
    description: `${appName} — ${t.metadata.description}`,
    display: "standalone",
    start_url: "/chat",
    scope: "/",
    theme_color: "#663a88",
    background_color: "#14171a",
    icons,
  };
  return NextResponse.json(manifest, {
    headers: { "content-type": "application/manifest+json" },
  });
}
