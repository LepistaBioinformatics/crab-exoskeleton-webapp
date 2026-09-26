# The lone workspace, and a picker led by the agent

Two requests that meet in the same place: the screen a member sees when the fragment
names no workspace. One restores a shortcut past it; the other rebuilds what is behind
the shortcut for everyone else.

## The request

> First, let us recover something that existed and was lost. When a member has only one
> agent, in one subscription, in one tenant — one workspace, in short — entering `/chat`
> should select that subscription + agent + tenant automatically, updating the URL state
> so the landing screen for that set is shown, without going through the screen that
> selects them.
>
> Second, the workspace selection screen should be refactored. Instead of boxes with
> agents inside subscriptions, orient the screen to the AGENT as the primary
> information: one agent per row of a data list, the first column being the agent's
> avatar and name, then tenant and subscription, and any additional information that
> exists — such as when the member was invited to the agent, and anything else there is
> (look at the object used to render the list and see what it carries).

## FR-1 — a workspace with one answer is not a question

### FR-1.1 — it existed, and the deletion was collateral

This is a restoration, and naming what broke it is part of the requirement, because the
same thing can happen again.

It was added on 2026-07-29 in `89ff744`, in `app/chat/workspace-nav.tsx` — the sidebar's
workspaces panel — with the commit saying *"A member with exactly one workspace skips the
tree entirely — once, guarded so pressing back does not throw them straight forward
again."* It was specified as R4 of `.specs/features/sidebar-panel-navigation/spec.md`,
which is still on disk and was never retired.

It died on 2026-09-13 in `d42e9c7`, the shell redesign, which deleted `workspace-nav.tsx`
whole. The deletion was **incidental**: that commit's message never mentions the
shortcut, and `.specs/features/chat-shell-redesign/design.md:105` records the check that
allowed it — *"checked: `unified-sidebar.tsx` is its only importer, and `WorkspaceGrid`
builds its own tiles"*. That check asked whether anything would fail to RENDER. It did
not ask what behaviour the component carried. `WorkspaceGrid` does build its own tiles,
and it never had the effect.

**It had no test.** `git log --all -S"autoSelect" -- "*.test.*"` is empty; the shortcut
was specified in three documents and covered by none, which is why nothing went red.
FR-1.5 exists so the restoration is not undone the same way.

### FR-1.2 — the rule

When the fragment has resolved and names no workspace, and the member's subscription list
has loaded and contains **exactly one agent leaf**, that workspace is entered without
being clicked.

**AC-1.2.1** — exactly one leaf enters it.
**AC-1.2.2** — two leaves under one subscription do not. Nor do two subscriptions with
one agent each, nor two tenants: the count is over LEAVES, across the whole tree, because
the thing being chosen is the agent.
**AC-1.2.3** — an empty list does not. Nothing to enter is a different screen (`EmptyState`).
**AC-1.2.4** — a list that has not loaded does not. `null` is "not fetched yet", which is
not "you have none".

### FR-1.3 — it lands on the landing, and does not mint

The old shortcut went through `createConversation` and wrote a `sid`. It is not restored
that way, because a later spec overtook it: `.specs/features/shell-path-and-landing`
FR-3.5 says **"No conversation is created until the member sends"**, and `chat-shell.tsx`
already says *"the landing's composer is the one mint"*.

So entering writes `t`, `s`, `r` and nothing else. `resolveCentre` then answers `landing`
on the absent `sid`, which is the screen the request asks for — a new conversation, or
the history.

**AC-1.3.1** — entering writes no `sid`, and creates no conversation.
**AC-1.3.2** — it drops `p` and `v`. A project or a destination left over from a previous
workspace would name something that does not exist in this one.

### FR-1.4 — once per session, and the way back stays open

The old guard was `autoSelect={!browsing}`, where `browsing` was shell state meaning "the
member pressed back to the tree on purpose". That state no longer exists.

The replacement is the mount: **a one-shot ref in `ChatShell`**, which is mounted for the
whole session. The way back to the picker is the breadcrumb root, which calls
`clearWorkspace` — and that empties the hash, so the picker's own component REMOUNTS. A
one-shot ref inside the picker would reset with it and throw the member straight forward
again, which is the exact failure the old R4.3 was written to prevent. The guard has to
live above the remount, and `ChatShell` already holds the subscription list.

**AC-1.4.1** — a member with one workspace who presses the breadcrumb root reaches the
picker and STAYS there.

### FR-1.5 — it is tested this time, at both ends

**Two tests, because the original failure was not a broken rule.** `planLeaves`, the
helper the old shortcut counted with, survived `d42e9c7` untouched and its test passes to
this day — under a name describing a caller that no longer existed. The arithmetic was
never what broke. **The caller was deleted, and nothing pinned the caller.**

So:

1. **The rule.** `loneWorkspace` is a pure function over the loaded tree, tested without
   mounting anything. The FR-1.2 acceptance criteria are its cases.
2. **The wiring.** A source-level assertion that `chat-shell.tsx` still calls
   `loneWorkspace` and `enterWorkspace`, on the grounds `pane-weight.test.ts` records for
   the same technique: a defect invisible to tsc and to every behavioural test needs
   something that reads the file. Verified by deleting the effect — the wiring test fails
   and all of (1) stays green, which is the original regression reproduced.

**AC-1.5.1** — the wiring test also asserts that `workspace-grid.tsx` does NOT reference
`loneWorkspace`. FR-1.4's placement is a requirement, not a preference: moved into the
picker it would look like a simplification and would silently reintroduce the remount
trap.

## FR-2 — the picker is a list of agents

### FR-2.1 — the agent is the row

One row per agent leaf, flattened across the whole tree, in the order the tree already
produces. Columns: **avatar and name**, then **tenant**, then **subscription**, then what
else the row carries.

What this replaces is a tenant section holding a wrapping grid of subscription boxes
holding a grid of square agent tiles — three levels of nesting to reach the only thing
that is clickable. `projects-screen.tsx` learned the same lesson three weeks ago and its
comment is the argument here too: a gallery shape *"spread a handful of projects across a
band wider than anything else in the app"*. A member with six agents has six rows.

**AC-2.1.1** — every agent appears exactly once, whatever its tenant and subscription.
**AC-2.1.2** — the tenant and the subscription are on the agent's own row. They are
repeated on each row rather than being a heading, because a row must be readable without
looking up.

### FR-2.2 — what the row can actually say

The request says to look at the object. It was looked at, through every layer, and the
answer is shorter than hoped:

`GET /v1/subscriptions` is served by **crab-shell-proxy**, `internal/httpapi/handlers.go:1039`,
as an inline `map[string]any` with **exactly seven keys**: `tenantId`, `subsAccId`,
`accName`, `role`, `perm`, `verified`, `scaffolded`. There is no DTO and no `omitempty`,
so that list is the complete wire contract. `app/api/subscriptions/route.ts` re-serialises
whole row objects, so nothing is being dropped in the BFF either — there is simply nothing
more arriving.

So the row carries:

| Column | Source | Per |
|---|---|---|
| avatar + name | `role` | agent |
| tenant | `tenantId`, resolved to a name by `useTenantBranding` | tenant |
| subscription | `accName` | subscription |
| read-only marker | `perms` | agent |
| "not set up yet" | `scaffolded` | **subscription** |

**AC-2.2.1** — read-only is marked and write is not, which is the rule `workspace-grid.tsx`
already had: write is the norm, so annotating it said nothing.
**AC-2.2.2** — `scaffolded` is rendered against the SUBSCRIPTION cell, never the agent.
It is `os.Stat` on the subscription's directory (`crab-shell-proxy internal/docker/manager.go:610`),
shared by every agent under it — so "this agent has never been used" would be a claim the
value cannot support. Two agents in one unscaffolded subscription both show it.
**AC-2.2.3** — `verified` is NOT shown. It is on the wire and it is per-agent, and the
owner excluded it.

### FR-2.3 — the invitation date does not exist, and this records why

The request asks for "when the member was invited to the agent". **It cannot be shown,
and it is not a webapp problem.**

The value is in the database — `guest_user_on_account.created`, mycelium-monorepo
`adapters/diesel_postgres/sql/up.sql:289` — and is dropped at the first hop: the
`licensed_resources` view (`up.sql:483`) does not select the column. It is therefore absent
from the row struct, the Rust DTO, the compact profile-header codec, the Go SDK and the
proxy handler. The codec is the hard part: the header is
`t/{tenant}/a/{acc}/r/{role}?p={role}:{perm}&s={sysAcc}&v={verified}&n={b64}` and has no
slot for a date, so even the transport between gateway and proxy could not carry one.

Surfacing it means six layers across two repositories, one of them outside this
submodule chain. Deferred, with the path recorded here so the next person does not have
to find it again.

Also in the proxy's hand at that same loop, dropped rather than missing, and each one
line: `sysAcc`, `roleId`, `permitFlags`, `denyFlags`. None of them is a statement a
member would read, so none is added.

### FR-2.4 — picking does not mint either

`pick` currently calls `createConversation` and writes a `sid` — it was last touched
before `shell-path-and-landing` FR-3.5 and was never brought in line, so entering a
workspace through the picker still mints a conversation nobody asked for. It now does
what FR-1.3 does, so the two doors into a workspace agree.

**AC-2.4.1** — clicking a row writes `t`/`s`/`r` and no `sid`.

### FR-2.5 — it is a destination, in the destination frame

The list renders inside `DestinationScreen`, whose own header says it was written for six
screens, has one, and that *"the second centre screen is the one that would drift, and
this is what it will be handed"* — and whose widths were copied FROM `workspace-grid.tsx`
in the first place. The picker is the screen it was kept for.

## The two effects meeting

Entering a workspace with no `sid` also wakes the tab-resume effect, which lands on the
remembered tab. That is not a conflict, it is the two features composing: a returning
member with tabs resumes them, and a member with none gets the landing FR-1.3 asks for.
Both are "where I was".

## A counter-principle, stated rather than ignored

`.specs/features/backoffice-admin-shell/spec.md:491` deliberately REFUSES this shortcut
on `/admin`: *"WHEN the caller manages exactly one subscription THEN step 2 still requires
the click."* Auto-selecting `scopes[0]` there was called a root-cause defect.

That is about choosing a target for a destructive configuration write, where a silent
choice means a member edits a thing they did not look at. Entering your only chat
workspace writes nothing and is reversible by the breadcrumb. The principle is real and
it does not reach this screen — but it is close enough that pretending not to have seen
it would be worse than saying so.

## Out of scope

- The invitation date (FR-2.3), and the mycelium change it needs.
- Sorting or filtering the list. Tree order is the order.
- `/admin`'s picker, which keeps its click on purpose.
