# canvas-removal — Specification

**Status:** Done (2026-09-05).
**Size:** Medium — one view deleted, and the seams it had grown into the shell,
the fragment, the sidebar, the reference slot and both dictionaries.
**Repo:** `crab-exoskeleton-webapp` only. The feature's own specs live in the
project repo and are stamped REMOVED: `canvas-timeline-view`, `canvas-activity`.

## Why

Members did not know what Canvas was for. It was a second top-level view of the same
conversations, reachable from a toggle in the chat header, and the report from use was
that people opened it, did not understand what to do with it, and left. A view nobody
uses is not free: it is a branch in the shell, a key in the URL, a variant in the
reference slot and two blocks of copy in every locale, all of which have to be read and
kept true by everyone who touches those files afterwards.

## What went

| Deleted | |
| --- | --- |
| `canvas-timeline.tsx` | the view |
| `canvas-activity.ts` + its test | the lane activity model |
| `view-mode-toggle.tsx` | the chat/canvas switch in the header |

| Pruned | What was left behind |
| --- | --- |
| `chat-shell.tsx` | the `canvas` branch, its import, `setView`; the `desktop` media query STAYS — the turn dock reads it |
| `chat-view.tsx` | the header toggle |
| `fragment.ts` | `setView` and the `view` key |
| `sidebar-panel-state.ts` | `forceWorkspaces`, which only the canvas set |
| `unified-sidebar.tsx` | the same prop, and the pinned-tree case in its suite |
| `conversation-bursts.ts` | `deriveLanes` / `ConversationLane` (canvas-only). `buildEvents`, `aggregateBursts` and the lane colours STAY — the conversation tree and the turn dock read them |
| `lib/chatReference.ts` | the `span` variant; `composer.tsx` loses its icon |
| `lib/i18n/chat.ts` | `viewMode.*`, `canvasActivity.*`, `canvas.*`, both locales; the parity allowlist loses four entries |
| `components/landing/*` | the `CanvasMini` diagram, its panel and its caption |
| `lib/i18n/landing.ts` | the canvas caption, the diagram label, and the Canvas half of the section's body copy, both locales |

## Decisions

| ID | Decision |
| --- | --- |
| DEC-1 | Delete rather than hide. Dead code that still compiles is code every future reader has to rule out |
| DEC-2 | `#view=canvas` in an old link is simply ignored — `readFragment` reads an explicit key list, so dropping `view` is the whole migration. No redirect and no cleanup pass: a one-off migration for a key nothing writes any more would outlive the problem |
| DEC-3 | `t.canvas.today` MOVED rather than died. Despite the name its only reader is the conversation filter's date presets, so it is now `t.search.today` |
| DEC-4 | The two feature specs are stamped REMOVED, not deleted. They are the record of what was built and why it was dropped |
| DEC-5 | The landing loses the Canvas panel entirely and the section keeps the Tree. The body copy was rewritten around it — **that wording is the implementer's, and wants a marketing read** |

## Verification

`vitest run` green, `next build` clean, and `tsc --noEmit` now reports **four**
pre-existing errors in unrelated test files instead of five — the fifth was in
`canvas-activity.test.ts`, which went with the feature.

## Still open

- **`zombie-crab-landing`** (the separate marketing repo, adapted from this one) still
  advertises Canvas. Nothing in this repo can fix that.
