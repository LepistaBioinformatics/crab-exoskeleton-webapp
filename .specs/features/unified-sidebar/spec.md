# unified-sidebar — Specification

**Status:** Draft
**Size:** Large (navigation restructure: 4 components, a new pure module, persisted-layout migration)
**Repo:** `crab-exoskeleton-webapp` only.

---

## Problem

`/chat` has two independent sidebars. `NavSidebar` holds branding, the workspace
tree and the account footer; `HistorySidebar` holds the conversation list with its
own search, new-chat button and list/tree toggle. Each is a `ResizablePane` with its
own width and collapsed flag, persisted together under `chat-sidebars`, and on mobile
each is its own overlay drawer behind its own hamburger.

Two panes cost up to **580px** of horizontal chrome (280 + 300 defaults) before the
conversation gets any. They also duplicate structure: two headers, two search inputs,
two collapse buttons, two scroll containers — for what a member reads as one question,
"which agent, and which conversation".

## Goal

One pane. Two collapsible groups inside it. Usable when either group has many items,
and free of tree chrome when the member's account has nothing to branch.

---

## Requirements

### FR-1 — One pane, two sibling groups

- **FR-1.1** A single `ResizablePane` holds, top to bottom: the brand header, a
  **Workspaces** group, a **Conversations** group, and the account footer. — DEC-1
- **FR-1.2** The groups are siblings, not nested. The workspace tree stays the
  workspace tree; the conversations listed are always the selected workspace's. A
  four-level tree (tenant › subscription › agent › conversations) was rejected: it
  buries hundreds of conversations inside a node and leaves the conversation
  search, the new-chat action and the existing list/tree toggle with nowhere to live.
- **FR-1.3** Each group has a header that is always visible and a body that
  collapses. Open/closed is persisted per group; both start open.
- **FR-1.4** Freed width goes to the conversation: one pane at 300px against two at
  280 + 300.

### FR-2 — Height, when both groups are full

- **FR-2.1** **Workspaces takes its content's height, capped at 40vh**, and scrolls
  inside itself past that. **Conversations takes the remainder** and scrolls inside
  itself. Both headers stay visible. — DEC-2
- **FR-2.1.1** The cap is **viewport-relative, not a percentage of the pane**. A
  percentage `max-height` resolves only against a parent with a definite height, and
  this parent is a flex item sized by flex resolution — the indefinite case, where the
  percentage is ignored outright. The tree would then render at full content height
  and push the Conversations header off screen, which is precisely the failure that
  ruled out a single pane-wide scroll. The pane is full-height, so `40vh` means the
  same thing in practice and needs no definite ancestor.
- **FR-2.2** No accordion (opening one closing the other): switching agent and then
  picking a conversation is the pane's main job, and both lists are visible for that
  today. No single pane-wide scroll either: with many workspaces it pushes the
  conversation search below the fold.
- **FR-2.3** The split is **not** draggable. With the cap content-driven, a member
  with one workspace sees one row and Conversations gets nearly everything; a member
  with thirty sees the cap. There is nothing to adjust in the common case, and a
  second resize axis in a pane that already resizes horizontally would need a
  re-fit rule for switching to a smaller tenant. — DEC-3

### FR-3 — A level with one node does not render

- **FR-3.1** **Any tree level holding exactly one node contributes no header, and
  its children are hoisted.** Applied per level, independently: one tenant hides the
  tenant row; a tenant with one subscription hides that subscription's row. — DEC-4
- **FR-3.2** The literal case in the request — one tenant, one subscription, one
  workspace — is this rule applied three times, not a special case beside it.
- **FR-3.3** When exactly one tenant exists, its identity (avatar, brand colour,
  name) moves to the **Workspaces group header**, so hiding the row does not lose
  who the workspaces belong to.
- **FR-3.4** The rule is about *rendering*, never about selection: hoisting a level
  changes no workspace key, no fragment and no request.
- **FR-3.5** While a workspace filter is active the tree renders every surviving
  level expanded, as it does today. The hoisting rule still applies to the filtered
  shape, so filtering to one tenant hides that tenant's row.

### FR-4 — Search, per group

- **FR-4.1** The **workspace filter exists only above 5 agents**, counted as agent
  leaves — the tenants and subscriptions they hang from are not rows in that count.
  At five or fewer, scanning the list is faster than typing. — DEC-5
- **FR-4.2** When it exists it is a **magnifier in the group header** that expands
  into a field, not a permanently open input. Two open text fields six rows apart in
  one narrow pane is the thing unification is supposed to remove.
- **FR-4.3** The **conversation search is always present**, threshold-free. History
  grows without bound — three conversations today is sixty next month — and its query
  is the rich one (`tag:`, content search over the network). A control that appears
  when history crosses a count is a moving target. — DEC-6
- **FR-4.4** The two searches are **not** merged. `tag:infra` and a content search
  mean nothing to an agent name, and the content search hits the network, so typing
  to filter workspaces would fire conversation requests per keystroke.

### FR-5 — Mobile

- **FR-5.1** One drawer, **two buttons**. The hamburger opens it focused on
  Workspaces; the message icon opens it focused on Conversations — that group
  expanded and scrolled to. — DEC-7
- **FR-5.2** Both buttons open the same pane and the same components. "Focus" is
  which group is expanded and where the pane is scrolled, nothing more.
- **FR-5.3** Losing the direct conversation button would turn switching
  conversation, the most frequent action, from one tap into open-scroll-pick.

### FR-6 — Canvas

- **FR-6.1** In the canvas view the **Conversations group is not rendered**, and
  Workspaces gets the full height. The canvas already lanes every conversation, so
  listing them beside it is the same information twice, competing for height with
  the tree — and switching agent is the only navigation the canvas still needs.
  This preserves today's behaviour (`workspace && !canvas`). — DEC-8

### FR-7 — Layout state

- **FR-7.1** One width and one collapsed flag replace two of each. Default **300px**
  (the larger of the two, since conversation rows carry inline actions and tags),
  minimum 240.
- **FR-7.2** The persisted key changes. Two old widths cannot be half-applied to one
  pane, and silently reading `navWidth` for the merged pane would give members a
  narrower sidebar than either of the two they had.
- **FR-7.3** With no workspace selected, the Conversations group is **present with
  an empty state**, not absent. A group that appears once a workspace is picked
  makes the pane's shape depend on selection, and the first-run member is exactly
  who needs to be told what to do next.

### NFR

- **NFR-1** No new dependency.
- **NFR-2** The hoisting rule and the agent count are **pure functions** in their own
  module, so both are tested without mounting anything (`environment: "node"`).
- **NFR-3** No change to `lib/subscriptions.ts`'s model, to the fragment, or to any
  request. This is a rendering and layout change.

## Decisions

| ID | Decision |
| --- | --- |
| DEC-1 | Two stacked collapsible groups in one pane |
| DEC-2 | Workspaces content-height capped at 40%, Conversations takes the rest, each scrolling internally |
| DEC-3 | The split is not draggable |
| DEC-4 | Any single-node level is hoisted away, per level |
| DEC-5 | Workspace filter only above 5 agent leaves |
| DEC-6 | Conversation search always present |
| DEC-7 | One drawer, two mobile buttons, differing only in focus |
| DEC-8 | Conversations group absent in the canvas view |

## Deferred

| ID | Idea | Why not now |
| --- | --- | --- |
| DEFER-1 | A draggable divider between the groups | DEC-3; revisit if members with many of both ask |
| DEFER-2 | Remembering the last conversation per workspace | Independent of the merge |
| DEFER-3 | Virtualizing either list | Neither is near the size that needs it; the caps bound what is painted |

---

## Traceability

| ID | Verified by |
| --- | --- |
| FR-3.1 | Unit: 1 tenant/1 sub/4 agents hoists both levels; 2 tenants with 1 sub each hoists only the subs |
| FR-3.2 | Unit: 1/1/1 yields a single agent row and no headers |
| FR-3.3 | Unit: the plan reports the sole tenant; component: its avatar renders in the group header |
| FR-3.4 | Unit: every agent leaf survives hoisting, with its key unchanged |
| FR-3.5 | Unit: hoisting applied to a filtered tree |
| FR-4.1 | Unit: `agentCount` counts leaves only. **Not** covered at component level — see below |
| FR-6.1 | Component: `hideConversations` renders no Conversations group |
| FR-7.3 | Component: no workspace → the group renders its empty state |

---

## Reconciliation (what shipped)

**The height cap was wrong on the first pass, in a way no test here can see.** It was
`max-h-[40%]`, and a percentage max-height against a flex-sized parent is indefinite
and ignored — so with many workspaces the tree would have rendered full-height and
pushed the Conversations header off screen, the exact outcome DEC-2 exists to prevent.
Now `40vh` (FR-2.1.1). The markup test asserts the class is the `vh` one and says
plainly that whether it *constrains* anything is layout, which `renderToStaticMarkup`
cannot observe.

**The mobile focus signal had to become a request, not a state.** The first version
passed the bare group and opened it from an effect keyed on that group. Three defects
followed: tapping the same button twice did not change `focus`, so the effect never
re-ran and a member who had collapsed Conversations by hand got a drawer that ignored
the button; the effect called a `setGroup` redeclared every render, so it closed over
a dependency it did not declare; and it called `scrollIntoView` on a ref whose node
`SidebarGroup` only mounts while open, so it was null on the very render that opened
it — silently doing nothing on the one path the second button exists for. `focus` now
carries a counter, persistence moved to a module-level function, and the scroll waits
for a second effect keyed on the group actually being open.

**Coverage the traceability table does not claim.** Several requirements have no
automated test and the honest thing is to name them rather than list a row that
implies otherwise:

| Requirement | Why not, and what covers it |
| --- | --- |
| FR-4.1 at component level (no filter at 5, filter at 6) | The tree comes from `fetch("/api/subscriptions")` in an effect, which never resolves in `environment: "node"`, so `groups` stays null and no filter renders either way. The rule itself is `needsFilter`, unit-tested. Manual UAT for the rendering |
| FR-4.2 (the magnifier expands into a field) | Same reason: the control only exists once the tree has loaded |
| FR-5.1/5.2 (mobile focus) | Needs a DOM, effects and `scrollIntoView`; none run in this suite |
| FR-1.3 (group state persists) | Needs `localStorage` and effects |

Closing them needs jsdom plus a testing library, which is the same gap the
admin instance-config spec records — one change, not four.

**Kept deliberately.** New chat stayed a **labelled** button in the group body rather
than becoming an icon in the header. It is the most important action in that group,
the header row already carries the agent name, the title and the list/tree toggle, and
an icon-only new-chat is exactly the discoverability this refactor has no business
spending.

**Also fixed in passing.** Both section titles were the literals `WORKSPACES` and
`CONVERSATIONS`, hardcoded in JSX and untranslated. They now come from
`chat.shell.workspaces` / `chat.shell.conversations`, which already existed as the
panes' aria labels.

**Verification.** `yarn tsc --noEmit` clean; `yarn vitest run` **371 passed / 32
files**, including 15 for the tree plan; `yarn build` succeeds. `/chat` 86.1 → 88.8 kB.
`yarn lint` is not a gate in this repo — it is unconfigured and prompts
interactively.
