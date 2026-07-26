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

## Result

All 16 tasks done. Final gates, run on the complete branch:

- `npx tsc --noEmit` — clean (this is also the en↔pt parity proof)
- `npx vitest run` — 119 passing, same as the baseline; no test needed changing
- leftover-literal sweep — one hit, `placeholder="SHARED_API_KEY"`, an example
  identifier and intentionally left
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
