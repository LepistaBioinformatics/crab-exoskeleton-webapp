# chat-shell-redesign — Step 1 report

**Date:** 2026-09-12. **Branch:** `spec/chat-shell-redesign`, uncommitted.
**Covers:** Step 1 of three (navigation — FR-1 to FR-5, FR-8, FR-9). Steps 2 and 3 (the
divider grammar in `/chat` and `/admin`) are specified and not started.

---

## Gates

| Gate | Before | After |
|---|---|---|
| `./node_modules/.bin/vitest run` | 118 files / 1505 tests, green | **120 files / 1539 tests, green** |
| `npx next build` | — | **exit 0** |
| `lib/i18n/parity.test.ts` | green | green |

`yarn test` cannot run on this host — it fails to write `/mnt/external/yarn-cache`. Call
the vitest binary directly. `tsc --noEmit` is not a gate here and still carries the
pre-existing fixture errors it had before (`conversation-bursts.test.ts`,
`history-cache.test.ts`, `scheduled-tasks.test.tsx`); no new one was introduced.

The test count went UP while seven surfaces were deleted, which is the shape to expect:
the deleted tests covered a rail and a sliding track, and what replaced them is a set of
pure modules that are cheaper to assert.

## What is on the branch

**New:** `destination.ts` (the `v` vocabulary and the centre-pane resolver), `crumbs.ts`
(the breadcrumb's presence rules, pure), `breadcrumb.tsx`, `sidebar-destinations.tsx`,
`destination-screen.tsx`, `projects-screen.tsx`, `workspace-screen.tsx`,
`media-refresh-bus.ts`, `use-conversations.ts` — each with its own test file.

**Rewritten:** `chat-shell.tsx` (owns the breadcrumb and the centre-pane switch),
`unified-sidebar.tsx` (one column, no track), `history-sidebar.tsx` (one list, its two
controls at its head), `chat-view.tsx` (no header, no right pane, no rail).

**Renamed:** `uploads-sidebar.tsx` → `files-screen.tsx`, with its tests.

**Deleted:** `right-rail.tsx`, `section-menu.tsx`, `projects-bar.tsx`,
`workspace-nav.tsx`, `sidebar-panel-state.ts`, `split-boxes.ts`, `panel-header.ts`, and
the tests whose only subject was one of them.

---

## Three things the implementation corrected in the spec

Recorded because each was a claim written before the relevant code was read, and each is
now fixed in `spec.md` rather than left as a discrepancy.

**1. File preview was never a pane** (FR-5.5, DEC-6 reversed). The spec said the preview
would stay beside the conversation. `FilePreview` is rendered inside the files panel as
its detail state — "the document takes the files slot while it is open" — so there was no
separate surface to keep. It moves to the centre with the screen that contains it and
gets full width. The regression this causes — you can no longer read a document and the
transcript at once — is FR-5.6, stated rather than hidden.

**2. The destination order came from the mockup, not the code** (FR-4.2). The spec listed
the rows as Projects, Files, Tasks, Memory, Graph, Secrets. `SECTION_ORDER` already has a
recorded reason for its own order, and three surfaces read it. The constant now spreads
it — `["projects", ...SECTION_ORDER]` — and the spec says why.

**3. "The last crumb has no link" was subtly wrong.** With an agent open and no
conversation chosen, the workspace IS the last crumb, so the rule stripped the only link
to the agent grid and left the member with no way out. The rule is now "the **leaf** has
no link", and `crumbs.test.ts` asserts the one-crumb case directly.

---

## Not verified — and why

The suite runs `environment: "node"`. There is no browser in this session, so nothing
below was checked. **None of it should be read as passing.**

| What | Requirement | Why it is unchecked |
|---|---|---|
| Nothing animates on first paint | FR-9.1 | The `armed` flag that guarded this is deleted with the track. Needs one page load, watched. |
| Focus after activating a destination row | FR-9.5 | The track's focus-request machinery is gone. Most important **inside the mobile drawer**, where closing the drawer moves focus on its own. |
| The composer is not covered by the soft keyboard | FR-9.6 | `h-dvh` + `interactiveWidget` are untouched, but the top bar above the centre pane changed. |
| The breadcrumb's mobile elision | FR-3.5 | The test asserts the `hidden md:flex` classes are on the right elements; it cannot assert what the breakpoint does. One look at phone width. |
| Rename and delete from the breadcrumb's chevron | FR-3.3 | Opening the menu, submitting the rename, confirming the delete, the outside-click and Escape paths — all require click dispatch. |
| The five panels at ~900px | — | Deliberately not adapted (FR-5.1's note). They will look like narrow columns in a wide pane. That is expected, not a defect to fix inside this change. |

## Open, and carried forward

- **OQ-1 — the mobile drawer's destination list.** Still open. The drawer currently holds
  every row; whether a phone should reach them only through the breadcrumb is a layout
  question worth one look at the real thing.
- **A third `listConversations` fetch** lives at `chat-view.tsx`'s resume-candidate
  effect. The shell and the sidebar now share one hook; that third reader does not. Not in
  this feature's scope, and the next natural lift.
- **`lib/chatSession.ts` gained an optional `onUnauthorized`** on `listConversations`.
  Forced: `if (!res.ok) return []` made a 401 unobservable, so no hook could send an
  expired session to `/signin`. All four existing callers pass nothing and still get `[]`.

---

## Corrections after first use

**2026-09-12, the same day.** The owner used what step 1 built and asked for one thing
back: *"The menu for opening files, the knowledge graph, scheduled tasks and so on is
good where it is, in the left sidebar. But only the chat should open in the central area
— when I click any of the others they should still open in the right sidebar, so the chat
can coexist with the other features."* They had also hit two navigation holes.

This is recorded as DEC-14 and DEC-15 in `spec.md`; the requirements it reverses
(FR-1.1, FR-4.3, the whole of FR-5, DEC-1/5/7/10) are corrected there rather than left
describing something else.

### What changed

| | before | after |
|---|---|---|
| `v` | `projects` + the five sections, centre pane | `projects` only, centre pane |
| `rs` | legacy, read-only, redirected to `v` | live again, its original meaning: which section is open in the pane BESIDE the conversation |
| a section row | replaced the conversation | opens the pane; clicking the open one closes it |
| the breadcrumb's leaf | the conversation, `Projects`, or a section name | the conversation or `Projects` |
| FR-5.6's regression | accepted ("you can no longer read a document and the transcript at once") | un-done — that is what the pane is for |

One deliberate asymmetry between the two surfaces that read the same row list: the
sidebar marks Projects `aria-current="page"` and an open section `aria-current="true"`;
the collapsed rail marks both `"true"`, because `RailPanel` carries one `active` flag and
a column of icons is not a list of pages. The row list, the order and the open/close
toggle are shared; only that attribute is not.

**Two keys rather than one with two render targets.** With one key, every rule about it
needs an "unless it is a pane one" clause. Two keys make `setFragmentSid`'s "drop `v`" and
"never touch `rs`" both unconditional, and each key means exactly one thing.

**A third hole, found while verifying rather than reported:** a file chip clicked while
the Files pane was ALREADY open opened nothing. `setRightSidebar("files")` writes the `rs`
that is already set, so no `hashchange` fires, nothing remounts, and the screen's
mount-only drain of `media-preview-bus` never runs again — the document stopped opening
from the second click on, and only then. The screen now subscribes to the bus as well as
draining it on mount, and consumes the parked copy so a later open does not re-show it.
It could not have existed in the centre-pane model: the transcript holding the chip was
never on screen at the same time as the files screen.

**New:** `workspace-pane.tsx` — the pane's chrome (width + `localStorage`, drag handle,
heading, close, mobile drawer), lifted out of what `uploads-sidebar.tsx` used to be so the
shell does not grow a pane's worth of layout. `WorkspaceScreen` renders inside it and lost
the `h-[70dvh] min-h-80` workaround it carried while the centre-pane frame gave it no
height.

**Restored from `HEAD`:** `setRightSidebar` in `fragment.ts`, `asSection` and
`nextSidebarValue` in `workspace-sections.ts`, with their comments corrected where they
described `rs=menu` as a pane this shell still has. **Deleted:** `destinationFromLegacy`
and `DESTINATION_ORDER` — there is nothing to redirect and nothing to order.

### The two navigation holes

**Entering a project, or opening a conversation inside one, left the projects list on
screen.** `v` outlived the click that was meant to leave it. `setFragmentSid`,
`setFragmentProject` and `setFragmentProjectSid` now each delete `v` — every one of them
is a member asking for the centre pane — and none of them touches `rs`.

**There was no way to LEAVE a project.** Every control led further in; the breadcrumb's
project segment goes to the list while keeping `p` (FR-1.5, and still right). The projects
grid now carries a card for the agent's own workspace, first, calling `onBrowse(null)` —
the same write a project card makes. The copy was already in both locales as
`projects.mainAgent` / `projects.mainAgentHint`, orphaned when the sidebar list it
belonged to was deleted.

### Gates after the correction

| Gate | After step 1 | After this correction |
|---|---|---|
| `./node_modules/.bin/vitest run` | 120 files / 1539 tests | **121 files / 1561 tests, green** |
| `npx next build` | exit 0 | **exit 0** |
| `grep -rn "destinationFromLegacy" app` | — | no matches |
| `grep -rn "border-brand/" app/chat components` | no matches | no matches |

### Still unverified, and now more of it

Everything in *Not verified* above still stands. The correction adds:

| What | Why it is unchecked |
|---|---|
| **The pane's height chain** | `aside` (stretched by the shell's flex row) → `shrink-0` header → `min-h-0 flex-1` body → panel. No test in a `node` environment computes layout, so a broken chain renders a zero-height panel and every test still passes. This is the one thing most likely to be wrong and invisible. |
| Entering a project from the projects screen, and clicking a conversation inside one | The fragment writes are asserted; that the screen then changes is not. |
| Leaving a project through the new card | Same. |
| Files open while a chat is on screen, both visible | The whole point of the reversal, and it is a layout claim. |
| Closing the pane, and the drag-to-resize | Neither is reachable without a real pointer. |
| The pane as a mobile drawer | `max-md:` classes are asserted as strings at best; the breakpoint is not. Note it covers the left drawer on a phone, which is why a section row closes that drawer too. |
| A stale `#v=projects` on a proxy without projects | `resolveCentre` answers `destination` and `ProjectsScreen` renders `null` (FR-2.4), so the centre is empty. **Not a regression** — the same was true after step 1 — and deliberately not fixed inside a correction. |

