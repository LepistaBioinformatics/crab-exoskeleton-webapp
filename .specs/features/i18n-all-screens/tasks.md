# Tasks — i18n across all screens

Gate for every task: `npx tsc --noEmit && npx vitest run` (baseline: clean, 119 passing).
Each task is one atomic commit.

| # | Task | Files | Status |
|---|---|---|---|
| T1 | i18n foundation | `lib/i18n/context.tsx`, `lib/i18n/format.ts`, `lib/i18n/common.ts`, `components/ui/language-switcher.tsx`, `app/layout.tsx` | pending |
| T2 | Error codes → localized text | `lib/i18n/errors.ts`, `app/chat/chat-view.tsx`, `app/admin/branding-panel.tsx` | pending |
| T3 | `/signin` | `lib/i18n/signin.ts`, `app/signin/page.tsx` | pending |
| T4 | `/onboarding` + `/offline` | `lib/i18n/onboarding.ts`, `lib/i18n/offline.ts`, both pages | pending |
| T5 | Shared UI primitives | `components/ui/*` (confirm-dialog, copy-button, spinner, avatar, alert, …) | pending |
| T6 | Chat shell & nav | `chat-shell`, `nav-sidebar`, `workspace-nav`, `logout-button`, `admin-link`, `install-app-button`, `empty-state`, `connectivity-error`, `view-mode-toggle`, `resizable-pane` | pending |
| T7 | Composer & editors | `composer`, `attachment-button`, `markdown-editor`, `message-content`, `memory-editor` | pending |
| T8 | Chat view | `chat-view` (43 strings) | pending |
| T9 | History & visualizations | `history-sidebar`, `conversation-search-bar`, `conversation-enrichment`, `conversation-tree`, `canvas-timeline` (+ FR-7 dates/plurals) | pending |
| T10 | Drawers | `secrets-drawer`, `uploads-sidebar` | pending |
| T11 | Admin shell | `admin-screen`, `scope-select`, `scope-tree`, `field`, `agent-target-select`, `resolution-ladder`, `fallback-editor` | pending |
| T12 | Admin — models | `model-registry-panel`, `model-defaults-panel`, `model-row`, `app/admin/format.ts` | pending |
| T13 | Admin — branding & members | `branding-panel`, `members-panel` | pending |
| T14 | Admin — shared resources | `shared-files-panel`, `shared-secrets-panel`, `shared-skills-panel` | pending |
| T15 | Landing diagram gap + metadata | `components/landing/diagrams.tsx`, `lib/i18n/landing.ts`, `app/layout.tsx` metadata, `app/manifest.webmanifest/route.ts` | pending |
| T16 | Final sweep | grep gate for leftover literals, `npx next build`, test updates | pending |

## Dependencies

T1 blocks everything. T2 blocks T8 and T13. T3–T15 are otherwise independent and
ordered smallest-first so the pattern is proven on `/signin` before the 250-string
admin surface.

## Not translated (and why)

- `app/admin/accordion.tsx` — does not exist at the base commit `f3f7438`; it is
  untracked in the user's working copy (spec R-1).
- Route handlers under `app/api/**` — they emit codes, not prose (FR-4).
