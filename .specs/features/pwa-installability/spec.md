# pwa-installability — Specification (webapp)

## Summary

Users could not "install the app": at best they got a desktop shortcut, which is a
bookmark, not an installed PWA. This feature makes the manifest and icons meet the
install criteria, and adds an explicit in-app **Install app** affordance because
people were not finding the browser's own menu entry (and on iOS there is no
prompt API at all).

Follows `../../../../.specs/features/white-label-pwa/` (FR-6..FR-8), which shipped
the first manifest and service worker.

## Diagnosis — evidence, not inference

The deployment is served over a real HTTPS domain (confirmed with the user), so
TLS is not the blocker and the manifest/icons are. Rather than guess which of
Chrome's criteria was failing, the pre-change state was checked directly against
the code and the built app:

| Finding | Evidence |
|---|---|
| Icons declared `192x192` and `512x512` but resolved to a **1408×768** image | `manifest.webmanifest/route.ts` pointed both entries at `/api/branding/logo/light`; `logo-light.jpg` is 1408×768 (PIL) |
| That image is a **wide wordmark**, marked `purpose: "any maskable"` | a non-square photo cannot survive a circular maskable crop |
| No `type` on any icon entry | manifest source |
| Icon fetch went through a **302** when branding was unset | `logo/[variant]/route.ts` returned `NextResponse.redirect(...)` for the default |
| No `id`, no `description` | manifest source |
| `apple-touch-icon` was the same non-square JPEG | `layout.tsx` `icons.apple` |
| The manifest **500s if Postgres blips** — `getAppName()` had no try/catch, unlike `layout.tsx`, which catches it explicitly | route source |

Each is a defect on its own terms, independent of which one Chrome reported
first, so all were fixed rather than ranked.

**Still to be run by an operator, on the real deployment:** Chrome DevTools →
Application → Manifest, and Lighthouse's installability audit. The post-change
state passes an equivalent scripted check locally (below), but only the browser
can confirm on the live origin — and the new Install button doubles as that
signal: Chromium fires `beforeinstallprompt` **only** when the criteria are met,
so if the button never appears there, something is still failing.

## Requirements

- **FR-1** Bundled icons are real **square PNGs** at their declared sizes:
  `/icon-192.png` (192×192), `/icon-512.png` (512×512), and
  `/icon-maskable-512.png` (512×512).
- **FR-2** `any` and `maskable` are **separate** manifest entries; the maskable
  art keeps its content inside the safe zone so a circular crop does not clip it.
- **FR-3** Every icon entry declares `type`, and every icon URL answers **200
  with real bytes** — no redirect in an icon fetch.
- **FR-4** The manifest declares `id` and `description`, and keeps
  `display: standalone`, `start_url`, `scope`, `theme_color`, `background_color`.
  No `display_override`: it addressed none of the diagnosed defects, and adding a
  manifest field on inference is what this feature is correcting.
  `screenshots` is deliberately **absent**: there are none to ship, and inventing
  one would misrepresent the app. It only affects the richer install dialog, not
  installability.
- **FR-5** The manifest never fails on a DB error — branding lookups fall back to
  the defaults, mirroring `layout.tsx`.
- **FR-6** Branding gains a **third image**: a square **app icon**, separate from
  the two wordmark logos. Reusing a logo is what made the manifest lie about its
  icon sizes. Uploads are restricted to **PNG/WebP** (SVG has inconsistent
  maskable support; JPEG has no alpha and degrades badly at 48px).
  - Squareness is **not** enforced server-side: there is no image decoder in this
    service, by the deliberate choice recorded in `white-label-pwa` ("no
    image-processing dependency"). The admin UI states the requirement instead.
    Accepted limitation.
- **FR-7** `apple-touch-icon` and the favicon point at the square app icon.
- **FR-8** An in-app **Install app** control: on Chromium it captures
  `beforeinstallprompt` and calls `prompt()`; on iOS Safari — which has no such
  API — it explains the Share → *Add to Home Screen* flow. It hides itself when
  the app is already running standalone.
- **FR-9** The service worker precaches the icons and bumps its cache version so
  the old shell cache is discarded.

## Out of scope

- Server-side image resizing (would need `sharp`; the branding feature
  deliberately avoids it — hence one 512 upload rather than generated sizes).
- Offline chat. The SW keeps the shell installable and fast; chat needs the
  network, unchanged from `white-label-pwa` FR-7.
- Screenshots for the richer Android install dialog.

## Acceptance criteria

- **AC-1** Every manifest icon answers 200, with a `content-type` matching its
  declared `type`, and real pixel dimensions matching its declared `sizes`.
- **AC-2** At least one `purpose: "any"` icon is ≥192px and at least one
  dedicated `purpose: "maskable"` icon exists.
- **AC-3** The manifest serves 200 with the default name when Postgres is
  unreachable.
- **AC-4** With a custom app icon set, the manifest points at
  `/api/branding/logo/icon` and declares only the size it actually is (512).
- **AC-5** The Install button is absent when already installed, prompts on
  Chromium, and shows iOS instructions on iOS.
- **AC-6** Uploading a JPEG or SVG as the app icon is rejected (400).

## Files

- `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`
  (new).
- `app/manifest.webmanifest/route.ts` — rewritten icon set, `id`/`description`,
  DB-failure fallback, custom-icon branch.
- `app/api/branding/logo/[variant]/route.ts` — `icon` variant, bytes-with-200
  defaults (no 302), PNG/WebP restriction for the icon, DB-failure fallback.
- `lib/db.ts` — `app_icon`/`app_icon_type` columns (additive `ADD COLUMN IF NOT
  EXISTS`), `BrandImage` type, column map.
- `app/layout.tsx` — `icons.icon` + `icons.apple` → the square icon.
- `app/admin/branding-panel.tsx` — app-icon upload with the 512×512/safe-zone
  requirement stated.
- `app/chat/install-app-button.tsx` (new), mounted in `app/chat/nav-sidebar.tsx`.
- `public/sw.js` — precache the icons, `zc-shell-v1` → `zc-shell-v2`.

## Icon provenance (reproducible)

The bundled icons are derived from `public/logo-dark.jpg` (1408×768), not from a
new asset:

1. Threshold the image (`sum(rgb) > 200`) to find the artwork's bounding box.
2. A row-ink profile shows the crab glyph in rows ~138–512 and the wordmark text
   in rows ~562–670, separated by a blank gap (517–560). Only the **glyph** is
   used — a wordmark is illegible at 48px.
3. Crop the glyph with ~90px of real source padding on three sides, clamping the
   bottom to `B+8` so no clipped lettering enters. Real source pixels rather than
   a flat fill: a hand-picked `#14171a` butted against the panel's gradient left a
   visible rectangle seam.
4. Letterbox onto a square canvas filled with the mean of the crop's own top edge
   (`#090d10`). Coverage 1.0 for the `any` icons, 0.74 for the maskable one.

## Verification

- `npx next build` passes (24 routes).
- Scripted check against `next start` with **Postgres unreachable** — the DB
  fallbacks are exercised, not bypassed. 27 assertions, all passing:
  manifest 200 + all required fields; each icon 200 with `num_redirects=0`,
  `content-type: image/png`, real dimensions equal to declared and square; an
  `any` icon ≥192 and a dedicated `maskable` present; `/sw.js` served with a
  `fetch` handler; the document carries `rel="manifest"`, `apple-touch-icon` and
  the apple web-app meta. `/api/branding/logo/{light,dark,icon}` all answer 200
  with 0 redirects.
- **Not verified here**, and each needs something this environment lacks:
  - **AC-4** (the custom-icon manifest branch). Every assertion above ran with no
    branding row, i.e. the `BUNDLED_ICONS` path; the `getLogo("icon")` branch —
    two entries at `/api/branding/logo/icon` carrying the uploaded `type` — never
    executed. Needs a reachable Postgres with an icon stored.
  - **AC-6** (JPEG/SVG rejected as an app icon) — same reason.
  - **AC-5** and the real browser install — needs the HTTPS deployment and a
    device. Run the DevTools/Lighthouse step above and record its output here.

## Status: implemented (browser-side install confirmation pending an operator)
