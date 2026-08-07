# Feature — The restart banner has to be seen

**Status:** specified
**Scope:** Medium (one token pair, one component)

## Problem

`app/chat/restart-banner.tsx:102` renders on `bg-accent/10` with `border-brand/40`.
The accent is the app's cyan — the colour of *everything interactive*, at 10% opacity.
So the one strip that says "your assistant needs a restart to pick up a change" looks
like ordinary chrome and is read as ordinary chrome.

It is also the only surface in the app that has to interrupt without alarming: a
pending restart is neither an error nor a destructive state. It is a notice.

## Goal

An amber notice, adapting to the OS colour scheme like every other token.

## Requirements

**R1 — A new semantic token pair, not a reused one.**

`globals.css` already carries `--blocked` ("an action the data forbids") and
`--retiring` ("deprecated: still serving, no longer offered"). `--retiring` *is* a
theme-aware faded yellow and reusing it would cost nothing — but the file's own header
is explicit that these are semantic roles rather than a palette, and a restart notice
is not a deprecation. Add `--notice` / `--notice-weak` alongside them.

**R2 — Three places, or it does not flip.** The token goes in `:root`, in the
`@media (prefers-color-scheme: dark)` block, and in `@theme inline`. The file's header
warns why: a literal value in `@theme` bakes at build time and never responds to the
scheme. Missing the dark block yields a light-mode amber burned into dark mode.

**R3 — The banner uses it.** `bg-accent/10 border-brand/40` becomes the notice pair,
with the icon carrying the amber so the colour reads as deliberate rather than as a
tinted rectangle. Body text stays `text-fg`: the weak background is a surface, and the
message is prose.

**R4 — The error line stops being a raw Tailwind colour.** Line 119 is
`text-red-500`, the one thing in this component that does not adapt to the theme — and
it is about to sit on a new background. It becomes `text-blocked`, which is the token
for exactly this and flips with the scheme.

## Non-goals

- No change to *when* the banner appears, to polling, or to the restart call.
- The admin-side restart notice (`app/admin/restart-notice.tsx`) is a different
  surface with its own tests; out of scope unless it shares the component.

## Verification

`yarn test` (baseline 732 passing) and `npx tsc --noEmit` (baseline 4 pre-existing
errors, all in untouched test files).

Neither proves the banner is *visible* — that is the whole premise, so it is checked by
eye in both schemes before this is called done.
