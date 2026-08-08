# Feature — Three named sections in the chats sidebar

**Status:** specified
**Scope:** Medium (one shared header component, two panels, copy)

## Problem

The chats sidebar stacks three different things with no visible boundary between
them, and one of them is not where it belongs:

1. **Workspace** — the back control naming the subscription and agent
   (`history-sidebar.tsx:265`)
2. **Projects** — `ProjectsBar`, which brings its own header and its own bottom border
3. **Chats** — a label row, then the list or tree

The magnifier and the List|Tree switch sit in `SidebarPanel`'s `actions` slot — i.e.
in the **workspace** row, at the top of the panel. Both act on the chat list two
sections below, so the controls are separated from what they control by everything in
between.

There is also no way to fold anything away. `ProjectsBar` grows with the number of
projects and pushes the conversations down; inside a project it adds a description
line too.

## Goal

Three sections a member can point at, each with the same header grammar. The list
controls move to the list. Projects and Chats fold.

## Requirements

**R1 — One header grammar, shared.** A `SectionHeader` in
`app/chat/sidebar-section.tsx`: a disclosure chevron, a label, and a slot for trailing
controls. Used by both folding sections so they cannot drift apart — the whole
complaint is that the sidebar's parts do not look like parts of one thing.

`label` is a `ReactNode`, not a string: the projects section's header is an uppercase
eyebrow when listing projects and a back-control naming the project when inside one,
and those are the same section in two states.

**R2 — Section 1, Workspace.** Keep the back control; add an uppercase eyebrow above
it so it reads as the first of three rather than as panel chrome. `SidebarPanel`'s
`actions` slot ends up empty and is dropped from this call site (the prop stays —
`WorkspaceNav` still uses it).

**R3 — Section 2, Projects.** `ProjectsBar` renders through `SectionHeader` in both
states and takes `open` / `onToggle` from the parent. Collapsed hides the project
list (or, inside a project, the instructions and the edit form) and keeps the header —
including, inside a project, the project's name: that name is the context for the chat
list below and must not disappear with the body.

**R4 — Section 3, Chats.** Its header carries the label plus, moved down from R2, the
magnifier and the List|Tree switch, then the new-chat control.

**R4.1** When the section is collapsed those three controls are **not rendered**. They
act on a hidden list; offering them would be offering a no-op. The chevron and label
stay.

**R4.2** The search bar (`searchOpen`) is part of this section's body, so collapsing
hides it too. Reopening the section brings it back with its query intact — closing the
*magnifier* clears the query, folding the section does not, because folding is not a
statement about the filter.

**R5 — Fold state is not persisted.** Local `useState`, both open by default.
`unified-sidebar.tsx:25-37` records that a previous version of this sidebar had
per-group collapse persisted in localStorage and that it was removed deliberately.
Re-introducing a persisted key here would walk back into that.

**R6 — Copy.** A shared `sections` namespace with `expand` / `collapse` templates
(`"Expand {name}"`) and the `workspace` eyebrow, in `en` and `pt`.
`chat.sections.workspace` is the same word in both and goes in `parity.test.ts`'s
`SHARED` set, alongside the `chat.shell.workspaces` entry already there.

## Non-goals

- No change to what any control *does* — the magnifier, the view switch, project
  create/edit/delete and new-chat keep their current behaviour. This is where things
  sit and whether they fold.
- The workspace section does not fold. It is the panel's own header row and its
  back control is the way out of the panel.

## Verification

`yarn test` and `npx tsc --noEmit` — measured as "no new errors", since the tree
currently carries pre-existing failures from the in-progress agent-projects work.

Neither shows whether the three sections read as three. Checked by eye, with several
projects and a long chat list, both folded and unfolded.
