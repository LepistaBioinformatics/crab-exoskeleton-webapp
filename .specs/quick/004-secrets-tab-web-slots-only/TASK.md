# Quick Task 004: drop model API keys from the admin Secrets tab

**Date:** 2026-07-31
**Status:** Done

## Description

The Secrets tab's `native` format offered two slot families: a web search
provider's key and a model's API key. A model's key already has a home — the
Models tab, where the inventory is the single writer of
`model_list.<model>.api_keys`. Two entry points for one credential is one too
many, so the Secrets tab now offers only `web.<provider>`.

## What changed

`app/admin/shared-secrets-panel.tsx`

- Removed the `nativeKind` slot selector; `native` now means a web provider.
- Removed the model catalog entirely: `modelName`/`models`/`modelsError` state,
  the `listModels` effect, the agent-scope gate (`routedAgent`,
  `pickAgentFirst`), and the `selectModel` validation.
- `targetName()` returns `web.<provider>` for `native`.

`lib/i18n/admin.ts` (both locales) — dropped the 12 keys that became unused and
narrowed `formatNative`, which advertised "search-provider / model key".

## Deliberately unchanged

- **Listing and delete keep handling `model_list.*`** — same reasoning as the
  legacy all-agents store: an entry set before this change must remain visible
  and removable. Only the write path narrowed.
- **The proxy still accepts `model_list.<model>.api_keys` as a native slot.**
  This is a UI change; the server-side contract and its scope cascade are
  untouched.

## Verification

- `npx tsc --noEmit` clean.
- `npm test` — 36 files, 415 tests pass, including `lib/i18n/parity.test.ts`
  (en / pt-BR key parity, which is what would catch removing a key from one
  locale only).
- `npx next build` passes.

## Still not verified

Not exercised in a browser. The panel has no component test — the suite covers it
only through `tsc` and the build.
