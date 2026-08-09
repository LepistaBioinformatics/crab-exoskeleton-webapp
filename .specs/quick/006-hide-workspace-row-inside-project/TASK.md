# Quick Task 006: drop the workspace row from the sidebar while inside a project

**Date:** 2026-08-09
**Status:** Done

## Description

The chats sidebar has three sections: the workspace (subscription + agent, and the
way back to the workspace tree), the projects, and the conversations. Inside a
project the first section stayed on screen as **disabled static text**.

User-directed change: omit it entirely while a project is selected.

This **reverses a documented decision.** The old comment argued the identity had to
stay because "without it you cannot tell whose project you are in". Two things
undercut it:

- The row was already `disabled` inside a project, so it was identity occupying the
  panel's top row while looking like a control that had stopped working.
- The level above is one click away through the project's own back arrow, and
  leaving the project brings the row straight back.

## What changed

`app/chat/history-sidebar.tsx`

- `header={insideProject ? null : (…)}`. With the row gone, the branch no longer
  needs `disabled={insideProject}`, the conditional `aria-label`/`title`, or the
  conditional `ChevronLeft` — outside a project it is always a live control. The
  `enabled:hover:` / `disabled:cursor-default` variants went with them, since
  nothing disables the button any more.
- The JSX block was reindented: wrapping it in a ternary added a level the body did
  not have, and the surrounding code was already loosely indented there.

`app/chat/sidebar-panel.tsx`

- `header` is now optional, and the title row is **not rendered** when there is
  neither a header nor actions. Rendering it empty would leave its `pt-2` as a dead
  strip above the first section.

`app/chat/projects-bar.tsx`

- Comment correction only. It already claimed "the workspace control up in section 1
  is hidden here" while that row was in fact only *disabled*. That is now literally
  true, so the comment says so.

## What the panel looks like inside a project

The project's own header becomes the top of the panel — back arrow, project name,
"Project" eyebrow — followed by that project's chats. Exit is still one level at a
time: the project's back arrow returns to the project list, where the workspace row
is rendered again and leads out to the workspace tree.

## Deliberately unchanged

- **`workspace-nav.tsx`'s `SidebarPanel`** still passes a header; making the prop
  optional does not change that panel.
- **The collapsed rail** still shows the current project's initials, so a collapsed
  sidebar can still answer which project you are in.
- **`onBack`** stays a required prop. It is unused inside a project but is the whole
  point of the row outside one.

## Verification

- `npx tsc --noEmit` — **5** errors, the same pre-existing test-file ones as before
  this change (none in the touched files).
- `npx vitest run` — 56 files, 783 tests pass.
- `npx next build` passes.

## Still not verified

**Not exercised in a browser.** `unified-sidebar.test.tsx` covers the sidebar but has
no case for the workspace row's presence, so nothing here is under test. What a human
should confirm:

1. Inside a project, no workspace/subscription/agent row at the top — and **no empty
   gap** where it was.
2. The project header sits flush at the top of the panel.
3. The project's back arrow returns to the project list, and the workspace row is
   back there and still leads to the workspace tree.
4. Outside a project the row is unchanged and clickable (it lost its `disabled`
   handling, so a regression would show as it no longer responding).
