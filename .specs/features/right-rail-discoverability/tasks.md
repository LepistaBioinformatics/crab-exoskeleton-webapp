# right-rail-discoverability — Tasks

**All done (2026-09-05).** See the Reconciliation section of `spec.md` for what
actually landed, including the two deviations.

Order is dependency order. Each task is TDD: the test first, watched failing.

## T-01 — the entry list, as a pure module

- **What:** `app/chat/workspace-sections.ts` — the five sections in order with their
  icons and labels, plus `nextSidebarValue(current, clicked)` (FR-2.1/FR-2.2) and
  `asSection(rs)` (the fragment guard added in review).
- **Reuses:** the `Section`/`SECTIONS`/`SECTION_ORDER` block moved out of
  `uploads-sidebar.tsx`, which re-exports the type for existing importers.
- **Done when:** unit tests cover the order and both toggle directions.
- **Covers:** FR-1.2, FR-2.1, FR-2.2.

## T-02 — the rail component

- **What:** `app/chat/right-rail.tsx` — `role="toolbar"`, five `IconButton`s with
  `title` + `aria-label`, `aria-current` on the open one, own surface, `hidden md:flex`.
- **Depends on:** T-01.
- **Done when:** component tests assert the aria contract and the visibility class.
- **Covers:** FR-1.3, FR-1.4, FR-1.6, FR-2.3.

## T-03 — secrets becomes a section

- **What:** `Section` gains `"secrets"`; `SECTION_ORDER` ends with it; the drawer's
  body moves into a pane; the drawer chrome and the header `KeyRound` are deleted.
  `onRestartNeeded` keeps its wiring.
- **Done when:** the existing uploads-sidebar suite is green, secrets renders as a
  section, and nothing imports the drawer's chrome any more.
- **Covers:** FR-3.1, FR-3.2, FR-3.4, FR-3.5, FR-4.4.

## T-04 — secrets in the fragment

- **What:** drop `secretsOpen` local state; `rs=secrets` is the only source.
- **Depends on:** T-03.
- **Done when:** `fragment-right-sidebar.test.ts` covers set/read/clear for `secrets`.
- **Covers:** FR-3.3, FR-5.2.

## T-05 — mount the rail

- **What:** `ChatView` renders `[chat] [sidebar?] [rail]`; the rail is absent in the
  canvas view for free (canvas replaces `ChatView`).
- **Depends on:** T-02, T-03.
- **Covers:** FR-1.1, FR-1.5, FR-2.4.

## T-06 — the mobile expander

- **What:** below `md` the header's `PanelRight` opens a popup of the five entries
  **with labels**; choosing one sets `rs` and closes the popup. Attach-menu idiom:
  outside click, Escape, focus back to the trigger.
- **Depends on:** T-01, T-03.
- **Done when:** component tests cover the labelled list, the selection call, Escape.
- **Covers:** FR-4.1, FR-4.2, FR-4.3.

## T-07 — copy and gates

- **What:** new strings in `lib/i18n/chat.ts` (en + pt): the toolbar's accessible
  name, the secrets section blurb. Then `vitest run`, `tsc --noEmit`, `next build`.
- **Done when:** all three are clean, and `tsc` shows only the five pre-existing
  errors in unrelated test files.
