# Spec — i18n across all screens

Feature slug: `i18n-all-screens`
Scope size: **Large** (52 text-bearing components, ~11k lines of TSX)
Created: 2026-07-26

## Problem

`lib/i18n/` already exists and works, but it covers exactly one screen. Its own
header comment says so:

> Existing chat/admin screens are not yet translated — retrofitting them is a
> separate, incremental follow-up.

This feature *is* that follow-up. Every user-visible string on `/signin`,
`/onboarding`, `/chat`, `/admin` and `/offline` must flow through the same
dictionary mechanism the landing page already uses, in both shipped locales.

## Locales

`en` (default) and `pt` (pt-BR), exactly as declared in `lib/i18n/config.ts`.

> **Assumption.** The request said "pt e br". `LOCALES` has no third entry and
> `LOCALE_NAMES` maps `pt → "Português"`, so this is read as the existing
> pt-BR + en-US pair, not a new `br` locale. No locale is added.

## What already exists (the pattern to follow)

| File | Role |
|---|---|
| `lib/i18n/config.ts` | `LOCALES`, `Locale`, `DEFAULT_LOCALE`, `LOCALE_COOKIE`, `LOCALE_NAMES`, `isLocale()` |
| `lib/i18n/server.ts` | `getLocale()` — reads the cookie server-side |
| `lib/i18n/landing.ts` | `const en = {...}` → `export type LandingDict = typeof en` → `const pt: LandingDict = {...}` → `landingCopy: Record<Locale, LandingDict>` |

The `typeof en` → `pt: Dict` idiom is the load-bearing part: **`tsc` fails on any
key present in `en` but missing from `pt`, and on any extra `pt` key.** Every new
namespace reuses it, so "both locales, every string" is a compile-time guarantee
rather than a manual audit.

Explicitly **not** adopted: `[locale]` path segments or `next-intl`. The config
header already rejected routing ("that would ripple through every existing
screen") and the cookie approach is in production. No new dependency.

## Requirements

### FR-1 — Locale reaches every component
A locale resolved server-side from the cookie is available to any component
without prop drilling. Nearly every text-bearing file is inside a client tree
(only `app/offline/page.tsx` renders text purely server-side), so a client
context provider mounted in `app/layout.tsx` is sufficient.

### FR-2 — Namespaced dictionaries, one per screen area
`lib/i18n/<ns>.ts`, each built with the `typeof en` idiom:
`common`, `signin`, `onboarding`, `offline`, `chat`, `admin`, `errors`.
`landing.ts` stays as-is.

### FR-3 — Every user-visible string is translated
Includes, and is not limited to, JSX text. In scope:
- `aria-label`, `title`, `alt`, `placeholder` (heavy in `icon-button.tsx`,
  `input.tsx`, `copy-button.tsx`, `conversation-search-bar.tsx`,
  `uploads-sidebar.tsx`, `nav-sidebar.tsx`)
- `confirm-dialog.tsx` action labels and every call site's `title` / `message`
- toast / inline error and empty-state copy
- `<title>` inside SVG diagrams

### FR-4 — Error codes map to localized text
`app/api/**` already returns **codes**, not prose — `invalid_request` (81×),
`session_expired` (40×), `connectivity` (18×), `not_found`, `forbidden`,
`invalid_instance`, `unsupported_type`, `too_large`, `native_is_admin_only`,
`invalid_email`, `invalid_code`. The two ad-hoc mappers
(`app/chat/chat-view.tsx:917`, `app/admin/branding-panel.tsx:268`) are replaced
by one localized `errors` namespace keyed by code, with an unknown-code
fallback. **No API route handler changes.**

### FR-5 — A language switcher on authed screens
The landing gets its toggle from the embedded Lepista brand bar; `/chat`,
`/admin` and `/signin` have none today. A shared `LanguageSwitcher` client
component, mounted in the chat nav sidebar footer and on `/signin`, writing the
same `LOCALE_COOKIE` the landing writes (`path=/; max-age=31536000; samesite=lax`).

### FR-6 — `<html lang>` tracks the locale
`app/layout.tsx` hardcodes `lang="en"`. It becomes `async`, calls `getLocale()`
and emits `pt-BR` or `en`.

### FR-7 — Locale-aware dates and counts
- `app/admin/format.ts:18` `toLocaleString()`, `app/chat/conversation-tree.tsx:40-41`
  `toLocaleTimeString`/`toLocaleDateString` — pass the active BCP-47 tag instead
  of the browser default.
- Three hand-rolled plurals: `conversation-enrichment.tsx:52` (`tag`/`tags`),
  `canvas-timeline.tsx:305,493` (`msg`/`msgs`), `conversation-tree.tsx:337`
  (`messages`). **No plural engine** — each becomes an explicit `one` / `other`
  key pair per locale. Three literal strings beat a pluralization library.

### FR-8 — Metadata
`generateMetadata()`'s `"${appName} chat"` and `"${appName} — your own private
AI agent"` are localized. `app/manifest.webmanifest/route.ts` is reviewed and
localized if it carries prose.

### FR-9 — Landing diagram gap
`components/landing/diagrams.tsx` is part of the landing but was left behind by
the original pass: 12 hardcoded English strings (SVG `aria-label`s and mock
content such as "Assay pipeline v3 — normalization"). Folded into this feature
since the request is to follow the landing pattern *everywhere*.

### NFR-1 — No untranslated string ships
Verified by `tsc --noEmit` (dictionary parity) plus a repo grep gate for
hardcoded text in the touched files.

### NFR-2 — Green gates
`npx tsc --noEmit` clean and `npx vitest run` green after every task.
Baseline confirmed in the worktree: **tsc clean, 119 tests passing**.

### NFR-3 — Proper nouns stay untranslated
`zombie-crab`, `Mycelium`, `PicoClaw`, `crab-shell-proxy`, `Lepista`, model and
agent identifiers. Same rule the landing dictionary already states.

## Out of scope

- Adding a third locale.
- Locale in the URL path.
- Translating server-generated content from the proxy/gateway or agent output.
- Translating `.specs/`, `README.md`, or code comments.

## String inventory (measured, not estimated)

Extracted by script across 52 non-test `.tsx` files outside `app/api/`;
~587 candidate strings before false-positive pruning.

| Area | Files | Candidates |
|---|---|---|
| `app/admin/*` | 14 | 259 |
| `app/chat/*` | 20 | 267 |
| `app/signin`, `app/onboarding`, `app/offline` | 3 | 18 |
| `components/ui/*` | 11 | 15 |
| `components/landing/diagrams.tsx` | 1 | 12 |

Heaviest single files: `app/admin/shared-secrets-panel.tsx` (49),
`app/admin/model-registry-panel.tsx` (44), `app/chat/chat-view.tsx` (43),
`app/chat/history-sidebar.tsx` (39), `app/admin/branding-panel.tsx` (36).

## Risks / known conflicts

**R-1 — In-flight admin work in the user's checkout.** At planning time the main
checkout had uncommitted changes to `app/admin/admin-screen.tsx`,
`agent-target-select.tsx`, `model-defaults-panel.tsx`, `model-registry-panel.tsx`,
`resolution-ladder.tsx`, `lib/models.ts`, `lib/models.test.ts`, plus untracked
`app/admin/accordion.tsx` and two new tests.

Mitigation: all work happens in an isolated worktree branched from `HEAD`
(`f3f7438`), so the user's working copy is never touched. Consequence: those
admin files are translated from their committed state, and the in-flight edits
will need reconciling at merge. `app/admin/accordion.tsx` does not exist at HEAD
and is therefore **not** translated — called out in the PR.

**R-2 — Tests asserting English strings.** 119 tests pass today; some assert
rendered text (`fallback-editor.test.tsx`, `model-row.test.tsx`,
`avatar.test.tsx`). Any that break get updated to assert against the dictionary,
not re-typed English. Churn here is expected, not a regression.

**R-3 — `/offline` and the service worker.** The offline page is precached by
the SW, so a server-rendered locale would freeze at precache time. It reads the
locale on the client instead so a language change is reflected after hydration.
