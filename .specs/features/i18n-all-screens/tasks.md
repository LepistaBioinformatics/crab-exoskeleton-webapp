# Tasks — i18n across all screens

Gate for every task: `npx tsc --noEmit && npx vitest run` (baseline: clean, 119 passing).
Each task is one atomic commit.

| # | Task | Files | Status |
|---|---|---|---|
| T1 | i18n foundation | `lib/i18n/context.tsx`, `lib/i18n/format.ts`, `lib/i18n/common.ts`, `components/ui/language-switcher.tsx`, `app/layout.tsx` | done |
| T2 | Error codes → localized text | `lib/i18n/errors.ts`, `app/chat/chat-view.tsx`, `app/admin/branding-panel.tsx` | done |
| T3 | `/signin` | `lib/i18n/signin.ts`, `app/signin/page.tsx` | done |
| T4 | `/onboarding` + `/offline` | `lib/i18n/onboarding.ts`, `lib/i18n/offline.ts`, both pages | done |
| T5 | Shared UI primitives | `components/ui/*` (confirm-dialog, copy-button, spinner, avatar, alert, …) | done |
| T6 | Chat shell & nav | `chat-shell`, `nav-sidebar`, `workspace-nav`, `logout-button`, `admin-link`, `install-app-button`, `empty-state`, `connectivity-error`, `view-mode-toggle`, `resizable-pane` | done |
| T7 | Composer & editors | `composer`, `attachment-button`, `markdown-editor`, `message-content`, `memory-editor` | done |
| T8 | Chat view | `chat-view` (43 strings) | done |
| T9 | History & visualizations | `history-sidebar`, `conversation-search-bar`, `conversation-enrichment`, `conversation-tree`, `canvas-timeline` (+ FR-7 dates/plurals) | done |
| T10 | Drawers | `secrets-drawer`, `uploads-sidebar` | done |
| T11 | Admin shell | `admin-screen`, `scope-select`, `scope-tree`, `field`, `agent-target-select`, `resolution-ladder`, `fallback-editor` | done |
| T12 | Admin — models | `model-registry-panel`, `model-defaults-panel`, `model-row`, `app/admin/format.ts` | done |
| T13 | Admin — branding & members | `branding-panel`, `members-panel` | done |
| T14 | Admin — shared resources | `shared-files-panel`, `shared-secrets-panel`, `shared-skills-panel` | done |
| T15 | Landing diagram gap + metadata | `components/landing/diagrams.tsx`, `lib/i18n/landing.ts`, `app/layout.tsx` metadata, `app/manifest.webmanifest/route.ts` | done |
| T16 | Final sweep | grep gates below, `npx next build`, test updates | done |

### T16 gates

1. **Leftover literals** — sweep the touched files for hardcoded prose.
2. **Raw error codes** — `grep -rn "instanceof Error" app --include=*.tsx`;
   every hit must resolve through `errorText(err, …)`. A file can have every
   literal translated and still pass a raw `invalid_request` to the user, so
   the literal sweep alone does not cover this.
3. **Render modes** — `npx next build`; only `/signin` and `/offline` may have
   moved from static to dynamic (see design.md).

## Error-code consumers (must all be converted before T16)

T2 changes the `lib/*` fetch wrappers to throw an error **code** instead of an
English sentence. Until a component is converted it would render the raw code,
so every one of these must use `errorText(useT(errorCopy), …)` by the end:

`admin-screen`, `branding-panel`, `members-panel`, `model-defaults-panel`,
`model-registry-panel`, `shared-files-panel`, `shared-secrets-panel`,
`shared-skills-panel`, `attachment-button`, `chat-view`,
`conversation-enrichment`, `history-sidebar`, `memory-editor`,
`secrets-drawer`, `uploads-sidebar`.

All 15 are covered by T7–T14. T16 greps to confirm none was missed.

## Dependencies

T1 blocks everything. T2 blocks T8 and T13. T3–T15 are otherwise independent and
ordered smallest-first so the pattern is proven on `/signin` before the 250-string
admin surface.

## T17 — correction after review

The T16 literal sweep was **wrong**, and CodeRabbit caught it on PR #8. Its
regex required `>` and `<` on the same line and only scanned `.tsx`, so
multi-line JSX text and every `.ts` file went unexamined. It reported "one
intentional hit" when **45 strings were untranslated**, concentrated in
`model-registry-panel` (10), `lib/models.ts` (9), `model-defaults-panel` (6)
and `secrets-drawer` (5) — plus a Portuguese-only "Outros tipos" still sitting
in the composer.

Fixed, and the gate is now durable:

- `scripts/i18n-sweep.py` — the corrected detector, multi-line and `.ts`-aware,
  with the two failure modes written into its docstring.
- `lib/models.ts` stops emitting UI text. `modelsApiError`/`describeError`
  return an error **code** (`ModelsError.message` → `.code`), and `buildLadder`
  takes its rung wording through `LadderInput.copy`. Both were rendering
  English inside panels that were otherwise pt-BR — the resolution ladder was
  literally half-translated.
- `parity.test.ts` earned its keep here: it failed on four newly added keys
  before this was committed, all legitimately shared, now allowlisted.

## Result

All 16 tasks done. Final gates, run on the complete branch:

- `npx tsc --noEmit` — clean (this is also the en↔pt parity proof)
- `npx vitest run` — 121 passing (119 baseline, unchanged, + 2 new parity
  tests); no existing test needed changing
- **en↔pt value diff** — `tsc` proves every *key* exists in both locales but
  cannot prove the pt *value* was actually translated. A walk over all 497 leaf
  strings found 29 identical pairs, every one deliberate (loanwords Portuguese
  uses as-is — chat, tag, link, workspace, logos; product names — Canvas,
  Skills; the `tag:`/`alias:` query syntax; section numerals; sample
  identifiers). `lib/i18n/parity.test.ts` now enforces this with that set as an
  explicit allowlist, so a future untranslated key fails the suite
- leftover-literal sweep (`scripts/i18n-sweep.py`) — 4 hits, all known noise:
  two TypeScript generics parsed as JSX, and the `Mycelium WebApp`/`Mycelium
  API` product names in the landing diagram
- raw-error-code sweep — every `instanceof Error` site resolves through
  `errorText`
- `npx next build` — clean

## Not translated (and why)

- `app/admin/accordion.tsx` — does not exist at the base commit `f3f7438`; it is
  untracked in the user's working copy (spec R-1).
- Route handlers under `app/api/**` — they emit codes, not prose (FR-4);
  verified with `grep -rnE 'error: *"[A-Z]' app/api`, which returns nothing.
- Identifier examples: `SHARED_API_KEY`, `OPENAI_API_KEY`, `team-gpt`,
  `gpt-5.4`, `openai`, `https://api.openai.com/v1`, `skill-name`. These are
  examples of values that land in a config file verbatim.
- `?tab=` keys, secret formats (dotenv/json/file/native), the `tag:`/`alias:`/
  `text:`/`date:` filter prefixes, and the API's default `"New chat"` title —
  all matched as data, never shown as prose.
