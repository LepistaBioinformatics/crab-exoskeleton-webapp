# Quick Task 005: drop the resting dim from the chat sidebar

**Date:** 2026-07-31
**Status:** Done

## Description

The chats sidebar opened **faded**: at rest (cursor anywhere off the panel) every
conversation but the active one sat at `opacity: 0.4`, and only moving the pointer
over the panel lifted it. Users did not accept it — a list that arrives greyed out
reads as disabled or still loading, and the emphasis it bought was for a state
(the active chat) that already has its own `bg-accent/12` row background.

What users *did* accept is the other half of the same mechanism: hovering one
thread in the **tree** fades the others, so a conversation's lane line, its dot,
and its rows read as a single strand instead of getting lost among crossing lanes.
That one is a genuine hover affordance and it stays.

So: the resting dim goes everywhere, and the hover spotlight survives in the tree
only. The list view keeps no opacity treatment at all — its rows are distinguished
by the active background and the ordinary `hover:bg-elevated/60`.

## What changed

`app/chat/history-sidebar.tsx` — the list view loses dimming entirely.
- `conversationRow` cva: the `dimmed` variant (`spotlight-dim` / `opacity-100`)
  and its `defaultVariants` entry are gone; the call site is
  `conversationRow({ active })`.
- The `hoveredId` state and the per-row `onMouseEnter`/`onMouseLeave` that fed it
  are gone — nothing consumed them once the variant went.
- The `sidebarHovered` state and the wrapper `<div>` that existed only to carry
  its two mouse handlers are gone (the wrapper had no `className`, so its
  children needed no re-indentation).

`app/chat/conversation-tree.tsx` — the tree keeps hover-only spotlighting.
- The `sidebarHovered` prop is removed from the signature and the prop type; the
  parent was its only caller.
- The three-state computation (`spotlightId` / `uniformLit`, which fell back to
  `activeSessionId` whenever the sidebar was not hovered) collapses to
  `isDimmed = (id) => hoveredConv != null && id !== hoveredConv`. At rest that is
  `false` for every node, so the whole tree is lit.
- The active thread is still marked: `eventRow({ active })` carries
  `bg-accent/12`, independent of any opacity.

`app/globals.css` — `.spotlight-dim` / `.spotlight-dim-strong` and their
`@media (hover: hover)` gate are **kept** (the tree still applies both to nodes
whose color is an inline style). Only the rationale comment above them, which
described the resting dim and the touch-device problem it caused, is rewritten.

## Verification

- `npx tsc --noEmit` clean — the real gate here, since a leftover
  `sidebarHovered` prop or an orphaned state would surface as a type/lint error.
- `yarn test`: 419 tests pass across 36 files (no test referenced the dim).
- `yarn build` passes.
- `yarn lint` is **not** a gate in this repo: `next lint` has no ESLint config and
  drops into an interactive setup prompt.

## Notes

Out of scope, deliberately: `app/chat/workspace-nav.tsx` (the workspaces panel,
not the chats sidebar) and `app/chat/canvas-timeline.tsx` — the timeline already
dims on hover only, which is the model this change converges on.
