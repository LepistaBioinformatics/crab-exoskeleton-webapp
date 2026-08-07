# Feature — Consistent empty states across the sidebars

**Status:** specified
**Scope:** Large (one new primitive, 9 call-site files, ~14 new copy pairs, i18n parity gate)

## Problem

The knowledge-graph panel has four sub-tabs. Each one renders a different-looking
"nothing here" message, and none of them agrees with the panels beside it:

| Where | Code | Alignment | Type scale | Structure |
|---|---|---|---|---|
| Graph › Entities, empty graph | `memory-graph-views.tsx:84` | centered, `px-4 py-8` | `text-sm` title + `text-xs` body | title + body |
| Graph › Entities, type filter | `memory-graph-views.tsx:128` | centered, `px-4 py-6` | `text-xs` | one line |
| Graph › Map | `memory-graph-view.tsx:282` | centered **and vertically filled** | `text-sm` | one line (body only, no title) |
| Graph › Search, no hits | `memory-graph-views.tsx:182` | centered, `px-4 py-8` | `text-xs` | one line |
| Graph › Search, before a query | `memory-graph-panel.tsx:429` | — | — | **renders nothing at all** |
| Graph › Recent | `memory-graph-views.tsx:236` | centered, `px-4 py-8` | `text-xs` | one line |
| Files | `uploads-sidebar.tsx:813` | centered, `py-3` | `text-sm` | one line |
| Scheduled tasks, none | `scheduled-tasks-panel.tsx:374` | **left**, `px-3 py-4` | `text-sm` + `text-[11px]` | title + body |
| Scheduled tasks, all filtered | `scheduled-tasks-panel.tsx:382` | **left**, `px-3 py-4` | `text-sm` + `text-[11px]` | title + body |
| Agent secrets | `secrets-drawer.tsx:259` | **left**, `py-3` | `text-sm` | one line |
| Conversations list | `history-sidebar.tsx:365` | centered, `py-4` | `text-sm` | one line |
| Conversations tree | `conversation-tree.tsx:240` | centered, `py-4` | `text-sm` | one line |
| Workspaces list | `workspace-nav.tsx:234,236` | **left**, `px-2 py-3` | `text-sm` | one line |

Three alignments, three type scales, two structures, one branch that paints a blank
pane. Every one of these is hand-rolled markup at the call site; there is no shared
component, which is why they drifted in the first place.

## Goal

One presentational primitive, one anatomy — **icon + title + supporting sentence** —
used by every "nothing to show" branch in both sidebars. Copy revised so each state
says what happened *and* what to do next.

## Non-goals — read these before editing

**NG1. Do not collapse "empty" into "no matches".** Three call sites branch on this
today and the distinction is load-bearing:

- `memory-graph-view.tsx:286` — `entities.length === 0 ? emptyLabel : noMatchLabel`
- `uploads-sidebar.tsx:815` — `q ? noMatches : noneYet`
- `scheduled-tasks-panel.tsx:324-331` — `nothing` vs `allFiltered`, with a comment
  stating that saying "no scheduled tasks" while a filter hides them "would be a lie
  about the workspace rather than a statement about the filter"

Unify the *presentation*. Every existing branch survives, and gains its own copy.

**NG2. The primitive does not call `useT`.** `memory-graph-views.tsx` is deliberately
a set of pure functions of props so the `environment: "node"` suite can render them
directly (see its header comment). Copy arrives as string props; callers pass `t.*`.

**NG3. Inline sub-section notes stay inline.** `EntityDetail`'s `noObservations` and
`noSources` are one-line notes *under a heading inside* a populated pane, not
pane-level empty states. They keep their `<p>`; only their typography is aligned
(`mt-1 text-[11px] leading-snug text-fg-muted`). Same for `scheduledTasks.noRuns`
(`scheduled-tasks-panel.tsx:476`), which sits inside an expanded task.

**NG4. Admin screens are out of scope.**

## Requirements

### R1 — The primitive

**R1.1** A new `components/ui/panel-empty.tsx` exports `PanelEmpty`. The name avoids
collision with the existing page-level `app/chat/empty-state.tsx` (Logo + `h1`, shown
when no workspace is picked), which is a different visual and is **not** refactored.

**R1.2** Props: `icon?: LucideIcon`, `title: string`, `body?: string`. No context, no
fetching, no state.

**R1.3** One anchor — `px-4 py-8`, a block at the top of whatever container holds it —
and no variant to opt out of it.

*Amended after review:* this was specified as an `align: "top" | "fill"` variant, on the
argument that the map pane owns its whole height and would strand a top-anchored message
above a tall empty box. Built that way and looked at, the vertically-centred map read as
a fourth inconsistency across the four sub-tabs rather than as fitting its pane — which
is exactly what this component exists to remove. The variant is gone, so `PanelEmpty`
carries a plain class string and there is no conditional `className` to express.

**R1.4** Anatomy:

```
icon    lucide, size 20, text-fg-muted opacity-60, centered above the title
title   font-display text-sm font-semibold text-fg
body    mt-1 text-xs leading-relaxed text-fg-muted, max-w-[22rem] mx-auto
```

Text is centered. Body is optional so a state with genuinely nothing to add is not
padded with filler.

**R1.5** The wrapper carries `data-empty-state=""`. This is the marker the structural
test asserts on, and it is the mechanical proof that every branch goes through the
component rather than through look-alike markup (R5.1).

### R2 — Knowledge graph (the four sub-tabs)

**R2.1 Entities, empty graph** — `PanelEmpty` with `Network`, reusing
`t.memoryGraph.empty.title` / `.body`.

**R2.2 Entities, type filter matches nothing** — `PanelEmpty` with `Filter`, title
`t.memoryGraph.noneOfType`, new body `t.memoryGraph.noneOfTypeHint`.

**R2.3 Map, empty graph** — `PanelEmpty` with `Share2`, reusing
`empty.title` / `.body`. Today the map shows only the *body*, so this is the state
that gains a title.

**R2.4 Map, name filter matches nothing** — `PanelEmpty` with `Search`,
new title `t.memoryGraph.mapNoMatch` and body `t.memoryGraph.mapNoMatchHint`.

*Amended during execution:* this was specified as reusing `noResults`. It gets its own
title instead. `noResults` says "Nothing matched that search", and the map runs a
substring filter over names rather than a search — telling a member their search failed
when their filter did points them at the wrong fix.

**R2.5 Search, before any query** *(new state — currently a blank pane)* — `PanelEmpty`
with `Search`, new `t.memoryGraph.searchIdle.title` / `.body`. Rendered when
`mode === "search" && hits === null && !loading`.

**R2.6 Search, no hits** — `PanelEmpty` with `SearchX`, title `t.memoryGraph.noResults`,
new body `t.memoryGraph.noResultsHint` (says BM25 ranking has no synonyms, so try the
stored wording).

**R2.7 Recent, nothing in 24h** — `PanelEmpty` with `Clock`, title
`t.memoryGraph.recentCopy.nothing`, new body `.nothingHint`.

### R3 — The other right-sidebar sections

**R3.1 Files, none uploaded** — `PanelEmpty` with `FolderOpen`, title
`t.uploads.noneYet`, new body `t.uploads.noneYetHint`.

**R3.2 Files, filter matches nothing** — `PanelEmpty` with `Search`, title
`t.uploads.noMatches`, new body `t.uploads.noMatchesHint`.

**R3.3 Scheduled tasks, none** — `PanelEmpty` with `CalendarClock`, existing
`t.scheduledTasks.none` / `.noneHint`. Left-aligned today; becomes centered.

**R3.4 Scheduled tasks, all finished and hidden** — `PanelEmpty` with `CheckCheck`,
existing `t.scheduledTasks.allFinished` / `.allFinishedHint`.

**R3.5 Agent secrets, none set** — `PanelEmpty` with `KeyRound`, title
`t.secrets.none`, new body `t.secrets.noneHint`.

**R3.6 Memory** has no empty state — an unwritten `MEMORY_CUSTOM.md` is an empty
textarea with a placeholder, which is correct. No change beyond confirming its
`hint` paragraph matches the other panels' hint typography
(`text-[11px] leading-snug text-fg-muted`).

### R4 — Left sidebar

**R4.1 Conversations list, none** (`history-sidebar.tsx`) — `PanelEmpty` with
`MessageSquare`, title `t.history.noneYet`, new body `.noneYetHint`.

**R4.2 Conversations list, filter matches nothing** — `PanelEmpty` with `Search`,
title `t.history.noMatches`, new body `.noMatchesHint`.

**R4.3 Conversations tree, none** (`conversation-tree.tsx:240`) — same as R4.1.

**R4.4 Workspaces, none** (`workspace-nav.tsx:234`) — `PanelEmpty` with `LayoutGrid`.
The current `t.workspaceNav.none` is one long sentence; split it into title
("You aren't in any workspaces yet") and body ("Ask an operator to add you to one.").

**R4.5 Workspaces, filter matches nothing** (`workspace-nav.tsx:236`) — `PanelEmpty`
with `Search`, title `t.workspaceNav.noMatch`, new body `.noMatchHint`.

### R5 — Copy and i18n

**R5.1** Every new key is added to **both** the `en` and `pt` blocks of
`lib/i18n/chat.ts` in the same edit. `pt: ChatDict` makes tsc enforce key parity, and
`lib/i18n/parity.test.ts` fails on any leaf string identical across locales unless
whitelisted in its `SHARED` set. Neither is optional; both are per-task gates.

**R5.2** New keys (15 pairs):

| Namespace | Key | Requirement |
|---|---|---|
| `memoryGraph` | `noneOfTypeHint` | R2.2 |
| `memoryGraph` | `mapNoMatch`, `mapNoMatchHint` | R2.4 |
| `memoryGraph` | `searchIdle.title`, `searchIdle.body` | R2.5 |
| `memoryGraph` | `noResultsHint` | R2.6 |
| `memoryGraph` | `recentCopy.nothingHint` | R2.7 |
| `uploads` | `noneYetHint`, `noMatchesHint` | R3.1, R3.2 |
| `secrets` | `noneHint` | R3.5 |
| `history` | `noneYetHint`, `noMatchesHint` | R4.1, R4.2 |
| `workspaceNav` | `noneHint` (+ `none` shortened) | R4.4 |
| `workspaceNav` | `noMatchHint` | R4.5 |

**R5.3** Existing titles are re-read as *titles*, not sentences: a title that reads as
a full paragraph gets shortened and its detail pushed into the body. Bodies stay one
sentence and say what the member can do, not how the system works.

### R6 — Verification

**R6.1** `yarn test` passes and `npx tsc --noEmit` reports no *new* errors.

*Amended during execution:* two of the three planned gates do not work as written.
`yarn lint` is `next lint`, which is deprecated in Next 15 and drops into an
interactive ESLint-setup prompt — it has no working configuration in this repo, so it
cannot gate anything. And `npx tsc --noEmit` reports **4 errors at baseline**, all in
test files this feature does not touch (`canvas-activity.test.ts`,
`scheduled-tasks.test.tsx`, `unified-sidebar.test.tsx`). The gate is therefore "no new
errors", measured against that baseline, not "zero errors".

**R6.2** A structural test asserts that each pure empty branch emits
`data-empty-state`. This is the only mechanically checkable proof of R1.5, because the
suite runs `environment: "node"` — effects never fire, so no test can observe the
panels the way a member does.

**R6.3** "Tests pass" is **not** evidence for a feature whose premise is "these look
inconsistent". The four graph sub-tabs, Files, Tasks and Secrets are inspected in a
running app before this is reported done. A fresh workspace starts with an empty
graph, so all four graph states are reachable without fixtures.

## Existing tests this touches

- `app/chat/memory-graph-views.test.tsx` — passes `emptyTitle`/`emptyBody` as props and
  asserts `g.empty.title` / `g.empty.body` appear in the HTML. Any prop-signature
  change on `BrowseList` breaks it.
- `app/chat/scheduled-tasks.test.tsx:263` — renders first paint with no data, i.e. it
  already sits on a branch this changes.
- `app/chat/uploads-sidebar.track.test.tsx:34` — same.
- `lib/i18n/parity.test.ts` — every new pt string must actually differ from its en
  counterpart.

## Deferred

Nothing found so far. Admin screens (`app/admin/**`) carry the same class of drift and
are explicitly out of scope (NG4); recorded in `STATE.md` as a deferred idea.
