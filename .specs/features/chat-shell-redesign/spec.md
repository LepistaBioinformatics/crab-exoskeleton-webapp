# chat-shell-redesign — Specification

**Status:** Specified. Nothing implemented.
**Date:** 2026-09-12.
**Size:** Large — the shell's navigation model, the centre pane's state machine, the
divider grammar, and the copy that names all three.
**Repo:** `crab-exoskeleton-webapp` only. No proxy change, no BFF route change, no
submodule pointer.

---

## Problem

The shell answers "where am I" in five places and draws a rule under each one.

| Where | What it says | Line it draws |
|---|---|---|
| sidebar header | the product's name | — |
| sidebar track, panel 1 | which tenant / subscription / agent | `border-b border-brand/25` |
| sidebar track, panel 2 → projects section | which project | `border-t border-brand/20` |
| sidebar track, panel 2 → chats section | which conversation | `border-t border-brand/20` |
| chat header | subscription + agent, **again** | `border-b border-brand/30` |
| right rail | which workspace section is open | `border-l border-brand/30` |

Three consequences, all of them things a member runs into rather than things that are
merely untidy:

**The sidebar is a stack of unrelated questions.** It slides sideways between "which
agent" and "which conversation", and inside the second panel it splits vertically
between projects and chats with a draggable seam. A member who wants to see their
projects has to be in the right panel of a sliding track, with the right section
unfolded, at a height they may have dragged to nothing.

**The project is named in one place and the conversation in another.** The project's
name sits in the sidebar (`projects-bar.tsx`, the inside-a-project state); the
conversation's is in a header over the transcript. They are one location — a chat *in*
a project — and reading it means looking at two opposite corners of the screen.

**Nothing has room.** Two sidebars' worth of chrome was already cut once
(`unified-sidebar`), and the pane that was freed went back to holding a project list, a
chat list, a splitter, and three section headers.

## Goal

Copy the shape the owner supplied as reference (two screenshots, Claude.ai, dark):

1. **Destinations live in the centre.** The sidebar lists *where you can go*; the thing
   you went to is drawn in the middle of the screen at full width. Projects are the
   case that prompted this: a grid of project cards in the centre, entered by clicking
   one — not a list crammed above the conversation history.

   Scoped down on 2026-09-12 (DEC-14): **the projects screen is the only thing that
   takes the centre.** The five workspace sections are listed in the same sidebar and
   open beside the conversation instead.
2. **One breadcrumb at the top says where you are.** `Subscription · agent / Project /
   Chat`, in the shell's own top row, replacing the chat header.
3. **Few rules, legible type.** Separation comes from tonal surface steps and spacing,
   not from a violet hairline under every region.

Scope answered by the owner on 2026-09-12:

- the breadcrumb's **root segment carries the subscription and agent** (DEC-3);
- the sidebar carries **Projects, Files, Tasks, Memory** and the rest of the workspace
  sections (DEC-5) — **as rows, but only Projects as a centre destination** (DEC-14,
  after use);
- the visual pass covers **`/chat` and `/admin`**; the landing page is untouched
  (DEC-8).

---

## What this overturns

This repository comments its reasoning in the code, so a refactor that reverses a
documented decision has to say so — otherwise the next reader finds a comment arguing
against the code it sits in.

**`projects-bar.tsx`, the file header.** "It lives here and not in the workspace panel
because a project is a way of separating conversations, and the list it separates is
right below it." That is a correct account of a sidebar-shaped design and it is what is
being replaced. The new claim: a project is a *place* — it has its own workspace
directory, its own memory, its own files, its own scheduled tasks — and the chats
inside it are one of the things it holds, not its definition. A place is entered, and
what you find when you enter it is the whole centre of the screen.

**`chat-shell.tsx`, the `railProjects` block.** Project shortcuts on the collapsed rail
existed because "a collapsed rail could not previously say WHICH project you were in".
The breadcrumb says it now, at every width, collapsed or not. The shortcuts go.

**`right-rail-discoverability`.** The 48px rail exists because the five workspace
sections "were not being found". Promoting them to named rows in the sidebar is a
strictly louder answer to the same complaint — a labelled row beats an unlabelled icon
— so the feature's goal survives and its mechanism does not. The PANE those icons opened
survives too (DEC-14); it is the icon column that goes.

**`unified-sidebar`'s two-panel track** (FR-1, FR-2 of that spec, and the whole `track`
cva with its `armed` transition). The sliding track exists to ask "which agent" and
"which conversation" in sequence inside one pane. With agent selection moved to the
breadcrumb's root segment and its own centre screen, the sidebar has one list again and
the track has nothing to slide between.

**`chats-sidebar-sections`' three-section grammar and `split-boxes.ts`' draggable
seam.** Both arbitrate space between projects and chats inside one pane. With projects
out of the pane there is one list and nothing to arbitrate.

---

## Requirements

### FR-1 — The centre pane is a destination, named in the fragment

- **FR-1.1** A new fragment key **`v`** names what the centre pane shows INSTEAD of the
  conversation. Absent means the conversation. **Its one value is `projects`.**

  It listed the five workspace sections too, and the owner reversed that on 2026-09-12
  after using the result (DEC-14). They open in a pane beside the conversation, under
  **`rs`** — which is therefore a live key again, with the meaning it always had, not the
  legacy one FR-5.3 once described:

  | key | values | renders |
  |---|---|---|
  | `v` | `projects` | the CENTRE pane, instead of the conversation |
  | `rs` | `memory` \| `graph` \| `tasks` \| `files` \| `secrets` | the RIGHT pane, beside the conversation |

  Two keys rather than one key with two render targets, deliberately. With one key every
  rule about it needs an "unless it is a pane one" clause: `setFragmentSid` must drop a
  centre destination, because asking for a conversation is asking for the centre pane,
  and must NOT drop a pane one, because that is the coexistence being asked for. Two keys
  make both rules unconditional, and each key means exactly one thing.
- **FR-1.2** `v` is a **fragment key, not a route segment.** This is not a preference:
  `fragment.ts:setFragmentProject` records at length what happened the last time a
  selection moved into the path — `router.push` is a pushState, which does not fire
  `hashchange`, so the shell either remounted and replayed the sidebar's slide on every
  click, or did not remount and served a stale `sid`. `v` follows `hv` and `rs`, which
  already work.
- **FR-1.3** The centre pane's states, in resolution order, are:

  | condition | centre pane |
  |---|---|
  | fragment unresolved | spinner (unchanged) |
  | no workspace | the agent grid (`WorkspaceGrid`, unchanged) |
  | `v` set | the projects screen, scoped to the workspace **and** the project in `p` |
  | otherwise | `ChatView` |

  `rs` is not in this table and cannot be: it names what opens BESIDE whatever this
  resolves to, which is why it is a second key.

- **FR-1.4** `resolvePanel` (`sidebar-panel-state.ts`) returns `workspaces | chats`
  today and is the shell's one owner of "which panel". It is replaced by a resolver
  over this table, in the same shape and for the same reason: one pure module, so the
  sidebar's highlight and the centre pane cannot disagree about where the member is.
- **FR-1.5** `v` and `p` are **independent, and their combination is meaningful.**
  DEC-2 rejects two keys that can both be set, and this looks like one, so the rule is
  named here rather than discovered: `p` says *which workspace directory* a surface
  addresses, `v` and `rs` say *which surface*. `rs=files` with `p=legal` is the project's
  files, which is the point of having both. The one combination that needs deciding is
  `v=projects` with `p` set — reached by clicking the breadcrumb's project segment —
  and the answer is that **`p` is preserved and the grid marks that project as the one
  you are in.** Clearing `p` there would eject a member from their project for asking
  to see the list, and it would drop the `sid` that `setFragmentProject` clears with it.
- **FR-1.6** Entering a destination **does not clear `sid`.** A member who opens the
  projects screen and then presses the breadcrumb's chat segment lands back in the
  conversation they left. This is the opposite of `setFragmentProject`'s rule for `p`,
  and deliberately: changing project changes which workspace directory a conversation
  lives in, changing destination does not.
- **FR-1.7** **`v` is cleared by every write that asks for the centre pane; `rs` by
  none.** `setFragmentSid`, `setFragmentProject` and `setFragmentProjectSid` all drop
  `v`: each of them is a member asking to be shown a transcript or a project, and a `v`
  left standing answered that click by re-rendering the list they had just chosen from.
  None of them touches `rs`, because a pane is not somewhere the member is standing.

  Both holes this closes were hit in use: entering a project from the projects screen
  re-rendered the list, and so did clicking a conversation inside one.

### FR-2 — The projects screen

- **FR-2.1** `v=projects` renders a grid of project cards in the centre, one card per
  project of the current workspace: name, the first lines of its instructions, and the
  date the reference screenshot shows. Clicking a card enters the project — the same
  `setFragmentProject` write the sidebar list performs today.
- **FR-2.2** The grid carries the actions the sidebar section carries now: create,
  rename/edit instructions, delete, with the same confirm dialog and the same
  restart notice. Nothing about the project API changes; only where its controls live.
- **FR-2.3** Layout follows `workspace-grid.tsx`, which is the existing precedent for
  "the centre pane becomes a picker": a max-width column, a heading, a wrapping grid
  that stacks to one column on a phone. Two picker screens that look unrelated would be
  a new inconsistency in a feature whose point is consistency.
- **FR-2.4** An agent whose proxy does not support projects (`projects_unsupported`)
  shows neither the destination row nor the screen — the same silence
  `projects-bar.tsx` keeps today, for the same reason.
- **FR-2.5** **There is a way OUT of a project, and this screen is where it lives.**
  Added 2026-09-12: as first written, every control led further in — the sidebar entered
  a project, the breadcrumb's project segment led to this list while KEEPING `p` (FR-1.5,
  and still right), and nothing named the agent's own workspace at all. A member who
  entered a project stayed in it.

  The grid carries one card for the agent's own workspace, first, alongside the project
  cards: the same `onBrowse` a project card calls, with `null`. It is marked current when
  `p` is absent, like any other card, so a member outside every project can tell that
  they are somewhere rather than nowhere. The copy is `projects.mainAgent` /
  `projects.mainAgentHint`, which the dictionary already carried in both locales from the
  sidebar list this screen replaced — FR-8.2's dead keys, given their reader back.

### FR-3 — The breadcrumb

- **FR-3.1** It lives in the **shell**, above the centre pane, as a sibling of
  `ChatView` — not inside it. `ChatView` is keyed on the workspace and unmounts on a
  switch, which is exactly why `TurnDock` is already a sibling; a breadcrumb inside it
  would blank on every agent switch and flash on every project entry.
- **FR-3.2** Segments, left to right, each omitted when it has no value:

  ```
  Acme · alpha  /  Legal  /  Parecer TBDC   ⌄
  └─ workspace ─┘  └ project ┘  └── chat ──┘
  ```

  - **workspace** — the subscription name with the agent as a qualifier. This is the
    information today's chat header leads with, and the reason it does is recorded
    there: the subscription "is what tells two otherwise identical agents apart".
    Claude.ai has one agent and needs no such segment; this product spawns one container
    per (tenant, subscription, agent, user) and does. Clicking it goes to the agent
    grid.
  - **project** — present only when `p` is set. Clicking it goes to `v=projects`.
  - **chat** — the conversation's title or alias. Present only when `sid` is set and
    `v` is absent. With `v` set, `Projects` takes this slot instead, because the
    breadcrumb states where you *are*.

    **The five section names never appear here** (corrected 2026-09-12 with DEC-14).
    They did while they were centre destinations. A pane is not a place you are
    standing, so `… / Legal / Files` over a transcript that is still on screen would
    name somewhere the member has not gone.
- **FR-3.3** The trailing chevron of the reference screenshot opens the actions that
  belong to the named thing — for a conversation: rename, delete, the list/tree
  affordances that live on the sidebar row today. Reuse `app/admin/breadcrumb.tsx`'s
  menu behaviour where it fits; that component already solves the portal, the mobile
  tail and the keyboard path.
- **FR-3.4** The breadcrumb replaces the chat header entirely. `PANEL_HEADER_H` exists
  only to keep that header and the sidebar header at the same height across the seam
  between them; with one bar spanning the width, the constant's reason is gone and it
  goes with it.
- **FR-3.5** On a phone the breadcrumb is the top bar: the hamburger, then the
  **trailing** segments (the ones nearest where you are), with earlier ones elided. The
  existing mobile bar showing `Agent alpha` is replaced.

### FR-4 — The sidebar

- **FR-4.1** Top to bottom: the brand header, **New chat**, the destination rows, then
  the conversation list, then the account footer. One column, no track, no splitter.
- **FR-4.2** The destination rows are **`Projects` followed by `SECTION_ORDER`** from
  `workspace-sections.ts` — so: Projects, Memory, Knowledge graph, Scheduled tasks,
  Files, Secrets. That module already exists precisely so the order and the labels have
  one owner; the sidebar becomes its third consumer rather than a fourth list.

  The order is `SECTION_ORDER`'s, not a new one. That module records why it is what it
  is — "memory and the graph are what a member asks about, scheduled tasks are what it
  does on its own, files and secrets are what they manage" — and a sidebar that reorders
  them would make the rail, the mobile expander and this list three different answers to
  the same question. Projects goes first because it is the only row that changes what
  every other row is scoped to.
- **FR-4.3** **One list, two kinds of row** (corrected 2026-09-12 with DEC-14). The rows
  still read as one list, because a member looking for Files should not have to know that
  Files is a different KIND of thing from Projects. What differs is the verb and the
  mark:

  | row | click | current when | `aria-current` |
  |---|---|---|---|
  | Projects | replaces the conversation | `v` is set | `page` |
  | a section | opens the pane beside it, and CLOSES it if that section is already open | `rs` names it | `true` |

  Both can be marked at once. That is the coexistence, not a conflict: `page` is the
  destination within this document that the member is on, and a pane open beside the
  conversation is not that. The open/close toggle is `nextSidebarValue` in
  `workspace-sections.ts` — the same function the collapsed rail calls, so a rail click
  and a sidebar click on the open section cannot mean different things.
- **FR-4.4** The conversation search and the List | Tree switch sit on **their own row
  at the head of the conversation list** (DEC-13). They lose the section header they
  live in today and gain nothing else: `chats-sidebar-sections` moved these controls
  down to the list they act on precisely because they had been stranded at the top of
  the panel, and that fix must survive a refactor that dissolves the section.
- **FR-4.5** The conversation list is the current scope's: the project's conversations
  inside a project, the agent's own outside one. Unchanged behaviour, one less
  container.
- **FR-4.6** The workspace panel and its sliding track are removed. Choosing an agent
  happens on the agent grid, reached from the breadcrumb's root segment.
- **FR-4.7** The collapsed rail keeps the panel entries and the new-chat action, and
  loses the project shortcuts (see *What this overturns*). It reads the SAME row list the
  open sidebar does, so the two cannot end up in different orders or answer a click
  differently.

### FR-5 — The workspace sections open beside the conversation

**Reversed on 2026-09-12, after the owner used the first result. See DEC-14.** As first
written this section made all five centre destinations, and the whole of it is restated
below rather than patched, because a half-corrected requirement is worse than either
version of it.

- **FR-5.1** Files, scheduled tasks, memory, the knowledge graph and secrets render in a
  pane on the RIGHT, beside the conversation, keyed by `rs`. The panel components keep
  their contents and their APIs; the pane keeps its width, its drag-to-resize, its close
  control and its mobile drawer treatment, all of which are `uploads-sidebar.tsx`'s and
  now live in `workspace-pane.tsx` on their own.

  What does NOT come back is the pane's sliding list of the other four. The sidebar names
  all five, which is a louder answer to the complaint the right rail was built for, so a
  second list inside the pane would only be a way in to where the member already is.
- **FR-5.2** The surfaces removed are `right-rail.tsx` (the icon column) and
  `section-menu.tsx` (its mobile counterpart). Both existed because the five sections
  "were not being found"; the sidebar's named rows answer that, and an unlabelled icon
  column on the opposite edge answers it worse.

  **The pane itself is NOT removed** — that is the reversal. What moved is where it is
  mounted: it was `chat-view.tsx:1256`, inside the view, and it is now a sibling of
  `<main>` in the shell, so the centre column reflows beside it instead of being covered
  by it, and it outlives a ChatView remount.
- **FR-5.3** `rs` is a **live key with its original meaning**: which section is open in
  the pane. The one value that does not come back is `menu`, the pane's own list of the
  other four — `asSection` reads it as no section, so a stale link carrying it opens no
  pane rather than a pane the shell cannot draw.

  There is no redirect to write, and that is the point of never having reused the key:
  `rs=files` in somebody's ticket still means what it meant when they wrote it. A `v`
  carrying a section name — from a link written while this spec said otherwise — resolves
  to nothing, which is the narrow window this reversal leaves open and it is one day
  wide.
- **FR-5.4** **Two of `UploadsSidebar`'s props come from `ChatView`'s own state and
  need a home outside it.** This is the load-bearing part of FR-5.1, so it is a
  requirement and not a note:

  - `refreshSignal={mediaRefresh}` — bumped at `chat-view.tsx:610` when the member
    uploads or drops a file, and read by BOTH the files panel and the composer's
    `@`-mention list (`chat-view.tsx:536`). A Files screen that is no longer mounted
    beside the composer cannot receive a React prop from it.
  - `openFile={requestedFile}` — set by `subscribeToPreviewRequests`, whose own comment
    says the request includes opening the files section because "a document with no
    panel around it has nowhere to render".

  Both become module-scope channels, which is a pattern this repository already has
  twice: `media-preview-bus.ts` for exactly this reason, and
  `chatSession.onConversationsUpdated`. No new mechanism is introduced.
- **FR-5.5** **File preview travels with the Files screen.** `FilePreview` is not a
  surface of its own: it is rendered inside the files panel as its detail state — that
  panel's own comment says "the document takes the files slot while it is open". So it
  goes wherever the files listing goes, and it goes into the pane.
  `subscribeToPreviewRequests` writes `rs=files`, not `v=files`; the screen collects the
  requested file off `media-preview-bus` when it mounts.
- **FR-5.6** **The regression this named is un-done.** It read: "reading a document and
  the transcript at the same time stops being possible", accepted because lifting
  `FilePreview` into a surface of its own was a feature with its own spec.

  With the sections back in a pane, clicking a file chip in a message opens the document
  BESIDE the message that mentioned it, which is what `file-preview-in-pane` was for and
  what a member clicking a chip inside a transcript is asking for. Nothing had to be
  lifted: the requirement was a consequence of putting the files screen in the centre,
  and reversing that reverses it. It comes off the roadmap.

### FR-6 — Fewer rules

- **FR-6.0** There is no divider grammar today; there are six. `border-brand/*` appears
  **136 times** across `app/chat`, `components/ui` and `app/admin`, at six different
  opacities — `/30` (67), `/20` (31), `/40` (21), `/25` (13), `/50` (3), `/10` (1).
  Whatever this feature decides, part of the deliverable is that the surviving hairlines
  come from a NAMED set, so the next component cannot invent a seventh.
- **FR-6.1** Region separation is **tonal**, not drawn: `--bg` for the centre pane,
  `--surface` for the sidebar, `--elevated` for raised rows. A `border-*-brand/*`
  hairline survives only where two surfaces of the same tone meet and the boundary
  carries meaning.
- **FR-6.2** **The light theme's surface steps widen** so tonal separation means the
  same thing in both themes (DEC-12). Both reference screenshots are dark, where
  `#14171a / #1b1f23 / #232a30` separate plainly; light is `#ffffff / #f7f9fa`, about 3%
  apart, so removing the borders there would remove the boundary outright. `--surface`
  and `--elevated` move in the `:root` block of `globals.css`. The exact values are a
  design-phase measurement against a contrast target, not a guess written here.
- **FR-6.2.1** These are **global tokens**, so this repaints the landing page and
  `/admin` as well as `/chat`. That is accepted, and it is why FR-6 ships apart from the
  navigation work: a token change is one small diff whose whole risk is visual, and it
  should be reviewable as such.
- **FR-6.3** Type: the destination rows, the breadcrumb and the conversation rows read
  at the reference's weight — the current `text-xs uppercase tracking-wide` eyebrows are
  a sidebar-of-sections idiom that has nothing left to label once the sections are gone.
- **FR-6.4** No token is deleted. `--brand` stays what it is; this is a change in how
  often it is drawn.

### FR-7 — `/admin` wears the same grammar

- **FR-7.1** The same divider and type decisions apply to `app/admin/**`, so the two
  halves of the product do not diverge. `/admin` already has a breadcrumb, a chooser
  and a panel; the change there is tonal and typographic, not structural.
- **FR-7.2** The surface is **28 files, 55 occurrences** of `border-brand/*`. Written
  down because "apply the same grammar to admin" is otherwise a blank cheque cashed
  during implementation: `admin-screen.tsx`, `branding-panel.tsx`, `breadcrumb.tsx`,
  `bulk-config-panel.tsx`, `chooser.tsx`, `column-view.tsx`, `fallback-editor.tsx`,
  `field.tsx`, `instance-config-editor.tsx`, `instance-mode-control.tsx`,
  `invite-member.tsx`, `json-code-editor.tsx`, `json-tree-view.tsx`,
  `members-panel.tsx`, `model-defaults-panel.tsx`, `model-registry-panel.tsx`,
  `model-row.tsx`, `panel-header.tsx`, `persona-panel.tsx`, `resolution-ladder.tsx`,
  `restart-chrome.tsx`, `restart-notice.tsx`, `restart-policy-select.tsx`,
  `scope-select.tsx`, `shared-files-panel.tsx`, `shared-secrets-panel.tsx`,
  `shared-skills-panel.tsx`, `user-models-panel.tsx`.
- **FR-7.3** No admin behaviour, route, or permission check changes, and the 25 admin
  test files stay green untouched. A visual pass that has to edit an admin test has
  stopped being a visual pass — that is the signal to stop and record it instead.
- **FR-7.4** `/admin` ships **separately** from the navigation work. See *Shipping*.

### FR-8 — Copy

- **FR-8.1** Every new string goes through `lib/i18n/chat.ts` and `useT`, in every
  locale the dictionary carries. `lib/i18n/parity.test.ts` is the check that this
  happened and must stay green.
- **FR-8.2** Strings whose only home was a removed surface are removed with it. A
  dictionary that accumulates dead keys stops being readable as a list of what the
  product says.

### FR-9 — What must not regress

Stated as requirements because each is a bug this shell has already had, with a test or
a comment naming it:

- **FR-9.1** No animation replay on load. The track's `armed` flag existed for it; with
  the track gone, nothing may take its place.
- **FR-9.2** The turn dock survives a workspace switch (it is a sibling of `ChatView`
  and must remain one).
- **FR-9.3** Entering a project still drops `sid` and `msg` in **one** fragment write —
  and, as of FR-1.7, `v` with them, and `rs` never.
- **FR-9.4** A conversation opened from a docked chip still arrives with its workspace
  and its project in one write (`setWorkspace`'s `project` argument).
- **FR-9.5** Focus follows navigation. The track's focus-request machinery was the
  answer to focus falling to `<body>`; a destination change must leave focus somewhere
  reachable, particularly inside the mobile drawer.
- **FR-9.6** `h-dvh` and `interactiveWidget: "resizes-content"` stay paired; the
  composer must not be covered by the soft keyboard.

---

## Decisions

- **DEC-1 — Destinations in the centre, not in a second pane.** The complaint is that
  the sidebar holds too many questions at once. Moving them to a right-hand pane would
  move the crowding, not remove it.

  **Narrowed on 2026-09-12 by DEC-14, after use.** It holds for Projects, which is a
  place. It does not hold for the five workspace sections: the crowding was in the
  SIDEBAR, and naming them as rows there is what fixed it — what they open onto was never
  the complaint. They go back to the pane.
- **DEC-2 — `v` is one key, not a boolean per destination.** The member is in exactly
  one place. Two keys that can both be set is a state the UI would have to arbitrate,
  and arbitration is what `rs` + `chat-files-open` already cost once.

  **`v` + `rs` is not the case this rejects, and the distinction is worth stating because
  it reads like one.** What `rs` + `chat-files-open` cost was two keys answering the SAME
  question — is the pane open — which is a state that can be self-contradictory and
  therefore has to be arbitrated. `v` and `rs` answer two different questions about two
  different render targets. Both set is not a conflict; it is the projects screen with
  Files open beside it, which is a thing a member can see and point at. And `v` stays one
  key across its own values, which is what this decision was actually about.
- **DEC-3 — The breadcrumb's root is the subscription and agent.** Owner's choice,
  2026-09-12, over putting an agent switcher in the sidebar header. It keeps the
  identity where the eye already goes for "where am I" and leaves the sidebar as a list
  of destinations only.
- **DEC-4 — The chat header is removed, not shrunk.** Two bars naming overlapping
  things is the problem; one bar with three segments is the fix.
- **DEC-5 — All the workspace sections become destinations, not just Projects.**
  Owner's choice, 2026-09-12. The narrower option — Projects alone, sections left in
  the right rail — would have left the shell with two navigation grammars.

  **Half reversed the same day by DEC-14, after use.** All six stay in one sidebar list,
  which is the half that answered the two-grammars objection; only Projects takes the
  centre. The rail is still gone — the alternative rejected here was the RAIL, not the
  pane it opened.
- **DEC-6 — File preview moves to the centre with the Files screen.** Reversed on
  2026-09-12 after reading `uploads-sidebar.tsx:1057`: the preview was never a pane, so
  "keep the pane" named nothing. See FR-5.5, FR-5.6.
- **DEC-7 — `rs` is redirected, not dropped.** Shared links. **Moot as of DEC-14:** `rs`
  is live again with its original meaning, so there is nothing to redirect and an old
  link opens what it always named. The instinct behind it is what made the reversal cheap
  — the key was never repurposed.
- **DEC-8 — `/admin` is included in the visual pass, the landing is not.** Owner's
  choice, 2026-09-12.
- **DEC-12 — The light theme's surface scale widens; the landing is repainted with
  it.** Owner's choice, 2026-09-12, over letting light keep a hairline the dark theme
  does without. Two themes with different separation grammars is a debt somebody pays
  later, and the landing being in scope for a token change is not the same as the
  landing being redesigned.
- **DEC-13 — Search and the view switch get their own row above the conversation
  list.** Owner's choice, 2026-09-12, over the breadcrumb's chevron menu and over
  promoting the tree to a destination of its own. The tree as a full-width destination
  is the more interesting idea and is explicitly NOT taken here: `conversation-tree-view`
  is COMPLETE and working in a 300px column, and rebuilding it for a new surface is a
  feature, not a side effect of a layout change.
- **DEC-11 — The project card's date is `createdAt`.** `lib/projects.ts` carries
  exactly one date and it is that one; it can be the empty string when the proxy did not
  send `created_at`, in which case the card shows no date. The reference screenshot's
  date slot is filled with the only date that exists rather than with an invented
  "last active", which nothing here tracks.
- **DEC-10 — The knowledge graph is a destination, not a pane.** It was the one
  candidate for a second side-by-side surface ("show me the graph while I read the
  answer that mentions it"). Rejected: a destination that can *also* open beside a
  conversation reintroduces exactly the two-places-to-be ambiguity DEC-1 removes, and
  the graph is the section that most wants full width.

  **Reversed on 2026-09-12 by DEC-14**, and the use case named here is the one the owner
  gave back almost word for word. "Show me the graph while I read the answer that
  mentions it" was not a candidate to be weighed against tidiness; it was the feature.
  The two-places-to-be ambiguity does not arise, because a section is never *also* a
  destination — each key has exactly one render target (FR-1.1).
- **DEC-9 — No proxy or BFF change.** Every screen this feature introduces is a
  different arrangement of data the webapp already fetches.
- **DEC-14 — Only Projects takes the centre; the five workspace sections open in a pane
  beside the conversation.** Reversed on 2026-09-12 by the owner, after using what
  DEC-1/DEC-5/DEC-10 built. The reason they gave: the menu for opening files, the
  knowledge graph and scheduled tasks is good where it is — in the left sidebar — but
  only the chat should open in the central area, so **the chat can coexist with the other
  features**.

  Reading a document, a graph or a task list is something a member does *about* a
  conversation, not instead of one. Every destination screen took the transcript off the
  screen to show something the member had opened in order to talk about it, and FR-5.6
  had already written that consequence down as an accepted regression — which is the
  shape of a decision that was wrong rather than expensive.

  What survives of the three it reverses is the part the owner kept: one sidebar list
  naming all six, which is what the right rail failed to do. What changes is only what a
  row opens onto.

  It is implemented as TWO KEYS rather than one with two render targets (FR-1.1), so that
  every rule about either is unconditional.
- **DEC-15 — The way out of a project is a card on the projects screen, not a control in
  the breadcrumb.** 2026-09-12, with DEC-14: the owner hit the hole, which was that there
  was no way out at all. The breadcrumb's project segment was the other candidate and is
  taken instead by FR-1.5, which is right — asking to see the list is not leaving. The
  grid is already the list of places a member can be, so the agent's own workspace
  belongs in it as one more card, and the copy for it was already in the dictionary
  (FR-2.5).

---

## Open questions

- **OQ-1 — Does the mobile drawer still hold the destinations?** FR-3.5 gives the
  phone a breadcrumb; whether the drawer keeps every destination row or the phone
  reaches them only through the breadcrumb is a layout question the design should
  answer with the rest of the mobile pass.

---

## Shipping

**Three changes, in this order, not one.** FR-1→FR-5 (navigation) and FR-6→FR-7
(tokens and type) are independent: the `v` key does not need the divider change and the
divider change does not need `v`. One branch that deletes the right rail, dissolves the
sliding track, adds six centre screens, adds a breadcrumb and retunes 136 borders across
both halves of the product is not reviewable, and the first red test would not say which
half caused it.

1. **Navigation** — FR-1 to FR-5, FR-8, FR-9. The shell's structure changes; it keeps
   the borders it has. This is where every deleted test and every new pure module lands,
   and it is the change that can actually break something.
2. **Grammar, `/chat`** — FR-6. Tonal separation and the named hairline set, applied to
   the surface the first change just settled. Applying it first would mean retuning
   components that are about to be deleted.
3. **Grammar, `/admin`** — FR-7. The same decision, mechanically applied, with no admin
   test touched (FR-7.3). Separable enough to be dropped or deferred without leaving
   `/chat` half-done.

Nothing gates step 2 or step 3 any more: DEC-12 settles the token question that did.

---

## Verification

The webapp's gates are `vitest` and `next build` — `yarn lint` does not run and `tsc`
carries pre-existing errors. **Baseline at the time of writing: 118 files, 1505 tests,
all passing** (`./node_modules/.bin/vitest run`; `yarn test` cannot write its cache on
this host). This is recorded because the refactor deletes surfaces that have tests, so
"red" has to be distinguishable from "already red".

**After step 1 and the DEC-14 correction: 121 files, 1561 tests, all passing.**

Tests that fail **by design** and must be removed or rewritten with the surface they
cover, not patched into passing: `unified-sidebar.test.tsx`, `sidebar-panel-state.test.ts`,
`split-boxes.test.ts`, `right-sidebar-switch.test.tsx`, `right-rail.test.tsx`,
`workspace-panel-scope.test.ts`, `section-menu.test.tsx`.

`fragment-right-sidebar.test.ts` was on that list and came off it with DEC-14: `rs` is
live, so its assertions are live too. They are folded into `fragment-destination.test.ts`
rather than resurrected as a file of their own, minus the `menu` cases — that file's
virtue is that the opposite rules about `sid` and `rs` are asserted next to each other,
where nobody can apply one of them to the wrong key.

New coverage this feature owes:

- **Fragment round trip for `v`.** `readFragmentForTest` exists because `rs` once
  shipped written but unparsed, and every field of `FragmentState` is optional so
  TypeScript cannot catch it. `v` gets the same round-trip test on the same grounds.
- **The `rs` round trip** — write, read back, close by removing the key, and every other
  key left alone including `v` (FR-5.3). Same grounds as `v`'s: `rs` is the key that
  once shipped written but unparsed.
- **The destination resolver** — the pure module replacing `resolvePanel` — over the
  whole table in FR-1.3, including the precedence between `v` and `sid`.
- **Entering a destination preserves `sid`** (FR-1.6) and **entering a project still
  drops it** (FR-9.3), asserted against each other so neither rule can be applied to
  the wrong key.
- **`setFragmentProject` and `setFragmentSid` each drop `v` and each leave `rs` alone**
  (FR-1.7) — the two navigation holes, and the coexistence, in one pair of assertions.
- **`asDestination` refuses a section name**, so a link written against the one-key model
  cannot put Files back in the centre.
- **The projects grid offers the agent's own workspace and calls `onBrowse(null)`**
  (FR-2.5) — the way out of a project.
- **`v=projects` with `p` set keeps `p`** and marks that project as current (FR-1.5).
  The inverse — the segment clearing `p` — is the regression this asserts against.
- **The breadcrumb renders each segment's presence rule** (FR-3.2), including the
  workspace-only case and the destination-in-the-chat-slot case.
- **The projects screen** creates, edits and deletes through the same client calls the
  sidebar section used, and hides itself on `projects_unsupported` (FR-2.4).
- **`lib/i18n/parity.test.ts` green** with the new and removed keys (FR-8).
- **`next build` clean.**

Not covered by the suite, and therefore to be checked by eye before this is called
done: **light mode with the borders removed** (FR-6.2). It is the one requirement here
whose failure mode is invisible to every test in the repository.
