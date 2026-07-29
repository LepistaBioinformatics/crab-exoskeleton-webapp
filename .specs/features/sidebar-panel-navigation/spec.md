# Sidebar panel navigation

## Problem

The sidebar splits vertically: a Workspaces tree on top (capped at `40vh`), a
Conversations list below. Two headers, two search affordances, two collapsible
groups, one narrow column. Members read it as two competing questions asked at
once instead of the sequence they actually follow — *which agent*, then *which
conversation*.

Unifying the two old panes into one column solved horizontal chrome. It did not
solve the confusion, because both groups still compete for the same vertical
space.

## Solution

One column, one panel at a time, sliding horizontally.

- No workspace selected → the Workspaces tree, full height, with search.
- Pick a workspace → the column slides left, revealing that workspace's
  conversations.
- A back control at the top of the conversations panel slides back to the tree
  so another workspace can be picked.
- Exactly one workspace available → skip the tree, land on its conversations.

## Requirements

### R1 — Two panels, one visible

**R1.1** The sidebar renders exactly one of two panels at a time: `workspaces`
or `chats`.

**R1.2** Which panel is showing is derived, never stored independently:

```
panel = forceWorkspaces || !workspace || browsing ? "workspaces" : "chats"
```

where `workspace` comes from the URL fragment and `browsing` is a local flag set
by the back control.

**R1.3** `browsing` is NOT persisted. A reload or a shared link resolves the
panel from the fragment alone.

**R1.4** Both panels stay mounted across the transition. Neither is unmounted,
emptied, or keyed off `browsing`.

**R1.5** The transition is a horizontal `transform` of ~250–300ms, disabled
under `prefers-reduced-motion`.

**R1.6** The off-screen panel is `aria-hidden` and `inert`, so its controls stay
out of the tab order while it is parked.

**R1.7** Focus follows a member-initiated slide into the incoming panel. The
control that triggered the slide sits in the panel that is leaving, and `inert`
on its ancestor blurs it — inside the mobile drawer that strands a keyboard
member outside an overlay with no way back in.

The target is the panel CONTAINER (`tabIndex={-1}`, named), not a control inside
it: the conversation list is keyed by workspace and remounts a beat after the
panel flips, which would blow away focus placed on any control within it.

The focus call MUST pass `preventScroll: true`. `overflow-hidden` stops the user
from scrolling the viewport, not the browser: focusing scrolls the target into
view, and that scroll offset compounds with the track's translate, sliding the
panel out of the box entirely. Observed symptom is the whole chats panel
rendering blank after a pick and returning on reload (a fresh document has
`scrollLeft` 0).

**R1.8** Focus does NOT move for a slide the member did not initiate — in
particular the single-workspace shortcut (R4), which flips the panel on its own.

### R2 — Workspaces panel

**R2.1** Takes the full height of the sidebar body and scrolls inside itself.
The `max-h-[40vh]` cap is removed.

**R2.2** The workspace filter is available regardless of how many agent leaves
exist. `FILTER_THRESHOLD` and `needsFilter` are deleted.

**R2.3** The filter stays behind the magnifier toggle: pressing it opens the
input, pressing it again closes the input AND clears the query.

**R2.4** ~~The tree's shape, hoisting rules, and sole-tenant identity in the
panel header are unchanged (`planWorkspaceTree`).~~ **Superseded by R9.**

**R2.5** Picking an agent leaf creates a conversation, writes the workspace to
the fragment, and clears `browsing` — which slides the column to `chats`.

### R3 — Chats panel

**R3.1** The panel header is a back control: a left chevron plus the selected
agent's name. Activating it sets `browsing`, sliding back to the workspaces
panel.

**R3.2** Going back does NOT clear the workspace from the fragment. The chat
view on the right keeps rendering the current conversation throughout.

**R3.3** The List/Tree view toggle stays in the panel header, beside the back
control.

**R3.4** New-chat, the conversation list, rename/delete/enrich and the spotlight
hover behaviour are unchanged. (Search: superseded by R11.)

**R3.5** The list still remounts when the workspace changes (`key` on
tenant|subs|role).

### R4 — Auto-selection of a single workspace

**R4.1** When the fragment carries no workspace, the subscription tree has
resolved to exactly one agent leaf, and `browsing` is false, that leaf is
selected automatically — through the same path as a manual pick, so a fresh
conversation is created.

**R4.2** It fires at most once per mount.

**R4.3** It does NOT fire while `browsing` is true. A member with one workspace
who presses back must be able to sit on the one-leaf tree without being thrown
forward again.

**R4.4** It does not fire before the fragment has resolved (`useFragment()`
returns `null` on first client render, which is distinct from "resolved and
empty").

### R5 — Canvas view

**R5.1** In the Canvas view the sidebar is pinned to the workspaces panel. The
Canvas already lanes every conversation; switching agent is the only navigation
it needs.

**R5.2** The `hideConversations` prop is replaced by `forceWorkspaces`, which
feeds the derivation in R1.2.

### R6 — Removals

**R6.1** The collapsible-group model goes: the `chat-sidebar-groups`
localStorage key, the `GroupState` type, its persistence helper, and the
`open`/`onToggle` props on `WorkspaceNav` and `HistorySidebar`.

**R6.2** `SidebarGroup` becomes `SidebarPanel`: header row plus scrolling body,
no chevron, no collapse.

**R6.3** `nav.pickWorkspaceForConversations` and `shell.conversations` become
dead copy and are removed from both locales. (The chats panel's header is the
back control carrying the agent's name; a "Conversations" title would only
restate what the panel visibly is.)

**R6.4** `FILTER_THRESHOLD` / `needsFilter` are removed from `sidebar-tree.ts`
and from its test.

### R7 — Mobile

**R7.1** Unchanged: one hamburger toggles the drawer; picking an agent leaves
the drawer open (the slide to chats happens inside it); picking a conversation
closes it.

### R8 — i18n

**R8.1** A new key `nav.backToWorkspaces` exists in `en` and `pt`, with
different values in each.

## Amendment — after first use

Three changes from using the shipped panels. They supersede R2.4 and the search
clause of R3.4; the requirements they replace are struck above rather than
deleted, so the spec does not silently contradict its committed version.

### R9 — The full tree, nothing hoisted

**R9.1** `planWorkspaceTree` renders a row for every level: tenant →
subscription → agent, always, whatever the number of siblings.

**R9.2** The hoisting rule and everything that served it are removed:
`TreePlan.soleTenant`, `PlanNode.hoistedAccount`, `TreePlan.agentCount`, the
`subLabel` on group headers, and `ScopeLabel`. `planWorkspaceTree` returns
`PlanNode[]` directly.

**R9.3** The sole-tenant identity beside the panel title goes with it. The
tenant now always has its own row, avatar included; repeating it in the header
would be the same thing twice.

**Why:** hoisting saved vertical space at the cost of a shape that changed with
the data — the same account rendered at a different depth, under a different
header, depending on how many siblings it happened to have. There was nothing
stable for a member to learn. It is also cheap to drop: the case hoisting was
designed for (one tenant, one subscription, one agent) is exactly the case R4
takes straight to the conversations, so that member never sees the tree at all.

**R9.4** Leaf identity is untouched, as before: hoisting was render-only, so
removing it changes no workspace key and no request, and the single-workspace
shortcut (R4) still reads its leaf off the plan.

### R10 — The chats panel names its subscription

**R10.1** The back control shows the SUBSCRIPTION name as the primary label,
with the agent's name beneath it in smaller, muted type.

**R10.2** With no subscription name available — the tree has not loaded, or the
subscription carries none — the agent takes the line alone. A uuid is never
rendered in the primary position: it says less there than the agent's own name
does.

**R10.3** `/api/subscriptions` moves from `WorkspaceNav` to `UnifiedSidebar`,
along with the 401 → `/signin` redirect and the error code. `WorkspaceNav`
receives `groups` and `error` as props.

**Why the lift:** the subscription name lives on the agent leaf, which only the
workspace tree holds. The tree is mounted in the other slot at all times (R1.4),
so fetching one level up costs nothing and saves the conversations panel a
second request on load and another on every agent switch.

### R11 — Conversation search behind a magnifier

**R11.1** The search bar and its filter pills are folded behind a magnifier
toggle in the chats panel header, matching the workspaces panel.

**R11.2** The toggle is offered at any conversation count — this is not a
threshold. Closing it clears the query, for the same reason R2.3 gives.

**R11.3** The field takes focus when opened.

**Why:** the search plus four filter pills is a four-row block sitting
permanently above the list whose first rows are what a member came to click, for
a query most visits never make.

## Out of scope

- Desktop collapse/resize of the sidebar column (`ResizablePane`) — unchanged.
- The chat view, canvas timeline, uploads sidebar, and secrets drawer.
- Any change to workspace identity, fragment keys, or requests.

## Test impact

`unified-sidebar.test.tsx` is **rewritten, not adapted**. Four of its assertions
are obsolete by design, not broken:

- "renders one pane holding both groups" — the two titles are never co-present.
- the `max-h-[40vh]` cap assertion — the cap is gone (R2.1).
- "keeps the Conversations group with an empty state before a workspace is
  picked" — that state is now the workspaces panel (R1.2).
- the canvas assertion — canvas now pins a panel rather than hiding a group
  (R5.1).

This is expected churn from the redesign and must not be read as regression.

`sidebar-tree.test.ts` is likewise **rewritten** for R9. Its entire second
`describe` block — "a hoisted level's label is carried, not discarded" — tested
a rule that no longer exists. What replaced it asserts the opposite property:
that an agent sits at the same depth whatever the tree around it looks like.
Coverage moved, it was not lost.
