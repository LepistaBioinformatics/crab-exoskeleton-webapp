# right-rail-discoverability — Specification

**Status:** Implemented (2026-09-05). See Reconciliation at the end.
**Size:** Large — a shell affordance in two platforms: a new rail component, a
drawer converted into a section, the mobile header control, the fragment, i18n.
**Repo:** `crab-exoskeleton-webapp` only.

---

## Problem

Members do not find the right sidebar. Asked to fetch a file the agent delivered, or
to look at what the agent remembers, they do not know there is anywhere to look.

The affordance is one `PanelRight` icon in the chat header (`chat-view.tsx:873`).
Behind it sits `UploadsSidebar`, which opens on a **list of sections** (`rs=menu`)
and slides to the one picked: memory, graph, scheduled tasks, files
(`uploads-sidebar.tsx:163`). So every one of those four features is two clicks deep
behind a single unlabelled glyph, and nothing on screen says they exist.

A fifth feature — Secrets — is worse off still: its own `KeyRound` icon in the same
header (`chat-view.tsx:866`) opening its own fixed overlay drawer
(`secrets-drawer.tsx`). Two doors, in the same corner, to the same question ("what
does this workspace have?").

## Goal

The features announce themselves. A member who has never opened the sidebar can see,
without clicking anything, that memory, the graph, tasks, files and secrets exist and
where they live.

## Non-goals

- **Not a redesign of the panes themselves.** Each section keeps its current content
  and behaviour; only how it is reached changes.
- **Not a change to who may see or edit a secret.** `native-secrets-admin-only` and
  `native-secrets-scope-gate` keep their rules; this moves the container, not the
  gate.
- **Not the canvas view.** `chat-shell.tsx:335/345` renders `CanvasTimeline` *instead
  of* `ChatView`, so the sidebar does not exist there today and the rail will not
  either.
- **No onboarding tour, coach mark or first-run pulse.** Discoverability here is
  structural — the controls are simply visible — and a one-time hint would be a
  second mechanism for the same job. See DEFER-2.

---

## Requirements

### FR-1 — The rail

- **FR-1.1** A vertical rail is pinned to the **right edge of the chat column**,
  always visible from the `md` breakpoint up, in the chat view, whether or not the
  sidebar is open. — DEC-1
- **FR-1.2** It holds five entries, in this order: **memory, graph, tasks, files,
  secrets**. The order is today's `SECTION_ORDER` with secrets appended — what the
  agent knows, then what it does, then what the member manages. — DEC-4
- **FR-1.3** Icons only (~48px wide), each with `title` **and** `aria-label`; the
  group carries an accessible name of its own. — DEC-2, DEC-7
- **FR-1.4** The rail is a **surface** — its own background and left border — not
  glyphs floating over the conversation. It has to read as a bar; that is the whole
  mechanism. — DEC-2
- **FR-1.5** Opening the sidebar does not move the rail: the sidebar opens **to its
  left**, so the row is `[chat] [sidebar?] [rail]`.
- **FR-1.6** Below `md` the rail is not rendered at all. — FR-4

### FR-2 — Selection

- **FR-2.1** Clicking an entry opens the sidebar on that section (`setRightSidebar(section)`).
- **FR-2.2** Clicking the entry of the section already open **closes** the sidebar
  (`setRightSidebar(null)`).
- **FR-2.3** The open entry is marked: `aria-current="true"` plus a filled visual
  state. With the sidebar closed, no entry is marked.
- **FR-2.4** Clicking a different entry while the sidebar is open switches sections
  and never closes it.

### FR-3 — Secrets becomes the fifth section

- **FR-3.1** `Section` (`uploads-sidebar.tsx:163`) gains `"secrets"`, and
  `SECTION_ORDER` ends with it, so it appears in the rail, in the mobile list, and in
  the legacy `rs=menu` pane with no special-casing anywhere. — DEC-3
- **FR-3.2** The drawer's **body** — `OwnModelsSection` plus the `SecretFormatGroup`
  stack — moves into the section pane. The drawer's **chrome** (the fixed
  `inset-y-0 right-0` panel, the backdrop, the translate transition) is deleted along
  with the header's `KeyRound` button.
- **FR-3.3** Which secrets pane is open stops being local `useState` (`secretsOpen`)
  and becomes `rs=secrets` in the fragment — so it survives a reload and travels in a
  shared link, like the other four. — DEC-3
- **FR-3.4** `onRestartNeeded` keeps its current wiring: a saved secret still asks for
  the restart banner exactly as it does today.
- **FR-3.5** No change to which secrets a member may read or write, or to the copy
  that explains an admin-published entry.

### FR-4 — Mobile

- **FR-4.1** Below `md`, the header's existing `PanelRight` button becomes an
  **expander**: it opens a popup listing the same five entries with **icon and
  label**. — DEC-5
- **FR-4.2** Choosing an entry sets `rs=<section>` and the existing 92vw overlay
  (`uploads-sidebar.tsx:817`) opens on that section. The popup closes.
- **FR-4.3** The popup follows the composer's attach-menu idiom
  (`attachment-button.tsx`): dismissed by outside click and by Escape, focus returns
  to the trigger.
- **FR-4.4** The header's `KeyRound` button is removed on mobile too, so secrets is
  reached the same way as everything else — one door, five destinations.

### FR-5 — Compatibility

- **FR-5.1** `rs=menu` keeps rendering the existing section list, so links already
  shared still open something sensible. Nothing in the interface links to it any
  more. — DEFER-1
- **FR-5.2** No new persisted state. `rs` in the fragment already carries which
  section is open; the rail reads it and writes it, and secrets joins it (FR-3.3).

---

## Decisions

| ID | Decision |
| --- | --- |
| DEC-1 | The rail is its own component, always mounted; `UploadsSidebar` keeps mounting only when open. Rejected: making the sidebar always-mounted and collapsed to rail width — it is 1151 lines with its own fetches and effects, and mounting it closed changes behaviour for a structural saving. Also rejected: an absolutely-positioned floating rail over the conversation, which overlaps the message column and the sidebar's resize handle |
| DEC-2 | Icons only with a hover tooltip, on a surface of its own. Chosen by the maintainer over an icon+label rail (~96-112px). Recorded with its cost: a pictogram for "memory" versus "graph" is a guess until the first click, and there is no hover on touch — which is why the mobile list carries labels (FR-4.1) |
| DEC-3 | Secrets becomes a section rather than a drawer the rail launches. A rail whose fifth button opens a floating overlay would mean two things at once, and it is the second door that is part of the reported confusion. It also moves secrets into the fragment for free |
| DEC-4 | Five entries and no more. The chat/canvas view toggle stays out: "where am I" and "what does this workspace have" are different questions, and mixing them is how the current header got confusing |
| DEC-5 | On mobile the expander is the header button, not a floating action button. The composer is `absolute inset-x-0 bottom-0` with the turn dock above it (`chat-view.tsx:1234`), so the bottom-right corner is already spoken for; an edge FAB would sit over the conversation and disappear behind the keyboard on short screens |
| DEC-6 | ~48px of the chat column, permanently, is the accepted price of the fix |
| DEC-7 | The group is `role="group"`, not `role="toolbar"`. Toolbar promises arrow-key navigation with a single tab stop; these are five ordinary buttons. Claiming a role a screen reader then acts on is worse than naming the group honestly. Revised during implementation, where the markup made the promise checkable |

## Deferred

| ID | Idea | Why not now |
| --- | --- | --- |
| DEFER-1 | Deleting the `rs=menu` pane | It costs nothing to keep and it is what old links land on. Delete it once no shared link plausibly points there |
| DEFER-2 | A first-run hint on the rail | DEC-2 accepts icon-only. If members still miss the rail, a one-time highlight is the next cheapest thing to try — and it should be tried only *after* the rail has been in front of real members |
| DEFER-3 | A collapse control on the rail | Only worth it if someone asks for the 48px back |

---

## Traceability

| ID | Verified by |
| --- | --- |
| FR-1.2 | Unit: the entry list is the five sections in order, from a pure module |
| FR-1.3 | Component: every entry renders both `title` and `aria-label`; the group carries `role="group"` and a name, and NOT `role="toolbar"` (DEC-7) |
| FR-1.6 | Component: the rail's root carries the `md` visibility class |
| FR-2.1 / FR-2.2 | Unit: given `rs`, clicking entry X yields `X`, and clicking the open one yields `null` |
| FR-2.3 | Component: exactly one entry has `aria-current` when `rs` names a section; none when it is null |
| FR-3.1 | Unit: `SECTION_ORDER` contains secrets last; the existing section-slide tests still pass |
| FR-3.3 | Unit: `fragment-right-sidebar.test.ts` gains `rs=secrets` — set, read back, and cleared |
| FR-4.1 / FR-4.2 | Component: the expander renders five entries WITH labels, and choosing one calls `setRightSidebar` with that section |
| FR-4.3 | Component: Escape and outside click close the popup |
| FR-5.1 | Unit: `rs=menu` still resolves to the list pane |

**Not covered by tests, stated instead:** that the rail is *noticed*. The whole
feature is a bet that five visible controls beat one hidden one, and the only
instrument for that is members using it. If the complaint persists, DEFER-2 is the
next move, not a bigger rail.

---

## Reconciliation (what shipped, 2026-09-05)

Implemented in the order of `tasks.md`, each task's test written and watched failing
first.

| Task | What landed |
| --- | --- |
| T-01 | `app/chat/workspace-sections.ts` — `Section`, `SECTION_ORDER`, `SECTIONS`, `nextSidebarValue` and `asSection`, moved out of `uploads-sidebar.tsx` so the rail, the expander and the legacy menu read one list. Secrets appended |
| T-02 | `app/chat/right-rail.tsx` — `role="toolbar"`, five icon buttons, `aria-current` on the open one, `hidden md:flex`, its own surface |
| T-03 | `secrets-drawer.tsx` → `secrets-section.tsx`: the fixed panel, the backdrop, the drawer header and the `open` prop are gone; the body is the pane. `UploadsSidebar` renders it for `section === "secrets"` and forwards `onRestartNeeded` |
| T-04 | `rs=secrets` covered in `fragment-right-sidebar.test.ts`; `secretsOpen` deleted from `ChatView` |
| T-05 | `ChatView` renders `[chat] [sidebar?] [rail]` |
| T-06 | `app/chat/section-menu.tsx` — the header control expands into the five sections **with labels**, portaled and fixed, dismissed by outside click and by Escape with focus returned |
| T-07 | `uploads.sections.secrets` added in both locales |

### Deviations from the spec above, and why

- **The header control is now mobile-only** (`md:hidden`). FR-4.1 said it *becomes*
  the expander below `md` and said nothing about desktop. Leaving it there would have
  put back the second door the feature exists to remove: on a desktop the rail is the
  control, always visible and one click from the pane.
- **`Section` and its list moved to a new module.** Not named in the spec. Three
  surfaces now render the same list, and leaving the definition inside the 1151-line
  panel would have made the rail import the panel to know what a workspace holds.
  `uploads-sidebar.tsx` re-exports `Section`, so existing importers are untouched.
- **Two strings deleted:** `view.secrets` and `view.files` were the labels of the two
  header buttons that no longer exist, in both locales.

### Two defects found in review, fixed here

- **A hand-edited `rs` could crash the panel.** `openSection` cast the raw fragment
  value to a `Section`; `SECTIONS[section].label(t)` then ran on `undefined` for
  anything that was not one. Now `asSection()` in `workspace-sections.ts` checks
  against `SECTION_ORDER`, with tests for a real section, for `"menu"`, and for
  garbage. Pre-existing, and worth fixing here because secrets moving into the URL
  makes an `rs` link more likely to be shared and edited.
- **`role="toolbar"` was a promise the markup did not keep.** See DEC-7.

### Verification

- 1396 tests green across 107 files, including the i18n parity suite; `next build`
  clean; `tsc --noEmit` shows the same five pre-existing errors in unrelated test
  files as before the change.
- **Not verified:** the feature's actual claim. Whether five visible controls beat one
  hidden one is answered by members, not by this suite — and the deployed webapp still
  serves the old bundle until it is rebuilt.

---

## Second pass — four things found in use (2026-09-05)

All four came from the maintainer opening the feature and using it. Each was fixed
with its test written first.

### The rail could not switch sections (the defect the rail created)

`UploadsSidebar` took `initialSection` and copied it into state at mount. That was
sound while its own menu was the only way to change sections; the rail is the first
control outside it, so clicking a second icon changed `rs` and moved nothing.

The panel is **controlled** now: `section` is a prop, the panel holds no copy, and
every change goes up through `onSectionChange`. One owner, which is the fragment.
Tested by rendering the panel at one section and re-rendering it at another —
asserted on the files pane's own header control appearing and going, because the menu
pane stays mounted through the slide and its text would prove nothing.

### The panel opened at 280px

It now opens at **a third of the viewport**, clamped to the existing minimum and to
what the viewport can show (`defaultPanelWidth`, unit-tested at three widths). A width
the member has dragged still wins — that is a decision, and a default that overrode it
would undo the drag on every open. Mobile is untouched: the overlay is still 92vw.

### Secrets opened on the models form

`OwnModelsSection` passed `defaultOpen` in all three of its states and sat above the
secret sinks, so the pane a member opened for a key opened on a form about models with
the keys below the fold. It is now **last**, and **nothing opens by itself** — the
sinks were already closed by default. The original rationale (a broken model is the
more urgent question) is recorded in the component and overturned there: the pane is
called Secrets, and nothing decides for the member what they came for.

### The knowledge graph had no refresh control

Files and tasks both carry one; the graph did not, and it is the pane most likely to
be stale — the agent writes to it while the member reads. `MemoryGraphPanel` takes a
`refreshSignal` that joins `active` in the deps of its two data reads (entities and
recent changes), and the panel header offers the same control for `section === "graph"`.
Tested by counting `readGraph` calls across a click. **Not covered:** the map view's
own data path, which does not go through those two reads.
