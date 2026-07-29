# Agent-first admin

## Problem

The admin screen asks for a tenant or subscription first, then offers an agent
picker inside each section. That is backwards from how the system is actually
built: agents exist in the proxy's configuration before any tenant or
subscription exists. Asking for the scope first implies agents are a property of
a subscription, and admins have read it that way and been confused about which
contains which.

The picker also carried an "all agents" option — a store every agent under the
scope reads. It made the confusion worse: an admin who never touched the picker
wrote to a store belonging to no agent in particular, while the screen's
navigation said they were configuring a subscription.

## Solution

The agent is the first thing selected, and it selects nothing else until it is
chosen. Everything downstream — which scope, which section, what a write reaches
— is expressed inside that agent.

"All agents" stops being an action. The store it wrote to still exists and still
holds whatever was put there, so it is reachable read-only, as legacy.

## Requirements

### R1 — Three modes at the top level

**R1.1** Level 1 offers `Agents`, `Members` and `Branding`.

**R1.2** `Agents` is the renamed `Scoped actions`. The old name described the
old model, in which the scope came first.

**R1.3** `Members` leaves the section tabs and becomes its own mode. It is not
agent-scoped: a member list belongs to a subscription, whatever agents that
subscription runs.

**R1.4** The tenant→subscription snap that the Members tab performed
(`admin-screen.tsx:213-223` before this change) is removed. The Members mode's
rail lists only subscriptions, so there is nothing to snap.

**R1.5** A mode is offered only when the caller can use it: `Agents` needs at
least one manageable scope, `Members` at least one manageable SUBSCRIPTION,
`Branding` branding rights. The mode bar is drawn only when more than one is
available. With none, the screen keeps its "no admin access" state.

**R1.6** Mode derivation and mode availability are pure functions in `tabs.ts`,
with a truth table over them. A `?tab=` naming a mode the caller cannot use falls
back to their FIRST AVAILABLE mode — never a fixed one, or a branding-only caller
would land on an agent gate leading nowhere.

### R2 — The agent gate

**R2.1** Entering `Agents` shows a list of agents and nothing else. No scope
rail, no section tabs, no panels.

**R2.2** Picking an agent replaces the list with the working view: the scope
rail, the section tabs, and the panels — all of it inside that agent.

**R2.3** The working view carries a control back to the agent list, and names
the selected agent.

**R2.4** No slide animation. The chat sidebar slides because it is a narrow
column where the movement carries meaning; this is a page-wide area, where the
same movement would be motion for its own sake.

**R2.5** The gate renders only once BOTH lists have resolved.

Scopes, because the "no admin access" state is decided by them — drawing early
risks offering a picker to someone who administers nothing, trading a short
spinner for a dead end. Agents, because `?agent=` resolves against that list, so
drawing before it lands would show the gate to a caller whose URL already names
an agent, then snap to the working view.

**R2.6** The agent list distinguishes "not fetched yet" (`null`) from "fetched
and empty" (`[]`). A failed fetch resolves to empty rather than staying null: the
screen holds a spinner on null, so a swallowed error would hang it. Empty is
reported by the gate, and the legacy entry still reaches what was stored.

### R3 — Agent-scoped sections

**R3.1** The sections under an agent are `files`, `secrets`, `skills` and
`model`. Every action they take is scoped to the selected agent.

**R3.2** `AgentTargetSelect` is deleted. The strip it lived in becomes a header
naming the selected agent, keeping the "what this reaches" sentence — without
its all-agents branch.

**R3.3** `ScopeRef.agent` is always set for these sections. There is no path
that reaches them without an agent.

**R3.4** The `model` section is offered only for agents the model inventory
governs (`picoclawAgentKeys`). A hermes agent reads its model from the proxy's
config.yaml, so a pin written for one is a record nothing reads — the tab is
absent rather than present-and-explaining-itself.

**R3.5** The restart-policy block, its validity gate and the restart notice are
unchanged, except that the target's agent is now always a real agent key.

### R4 — The legacy all-agents store

**R4.1** `ALL_AGENTS` survives as the key of a legacy entry, NOT as an action.
`scopeKey` and the wire format are unchanged, and `lib/adminRestart.ts`'s
stripping of the sentinel stays correct.

**R4.2** The agent list shows a `Legacy` group, visually subordinate and
separate from the real agents, holding one entry for the all-agents store.

**R4.3** It is shown unconditionally. Emptiness cannot be known at gate time:
the store is per scope, and no scope has been chosen yet — deciding would mean
probing every scope against three stores before drawing the list. The panels say
"nothing here" per scope instead.

**R4.4** Under the legacy entry: `files`, `secrets` and `skills` only. No
`model` — the registry is per agent (`agent/<agent>`) and already refuses an
all-agents selection.

**R4.5** Those panels are READ-ONLY EXCEPT DELETE. Listing, downloading and
removing work; creating, uploading and updating do not. The point is a way out
of the store, not a way back into it.

### R5 — URL state

**R5.1** The selected agent lives in `?agent=`, under the same rules `?tab=`
already follows: the URL is the single source of truth, written with `replace`
and `scroll: false`.

**R5.2** An `?agent=` naming no known agent (or the legacy key when the group is
hidden) resolves to no selection — the agent list — rather than rendering an
empty working view. Same reasoning as `parseTab`: the query string is
user-editable.

**R5.3** The scope stays out of the URL, as today.

## Out of scope

- The proxy's own API and its all-agents store semantics. Nothing server-side
  changes; this is a change in what the screen offers.
- Migrating data out of the all-agents store. R4 gives admins a way to read and
  remove it by hand; no bulk move is provided.
- The Branding panel, the instance-config editor, and the members panel's own
  internals.

## Test impact

- `agent-target-select.test.tsx` is DELETED with the component it covers.
- `lib/admin.test.ts` and `lib/adminRestart.test.ts` assert on the `ALL_AGENTS`
  sentinel and **stay valid** — the sentinel survives as the legacy key, and
  stripping it from the wire is still correct.
- `tabs.test.ts` changes with Members leaving the tab set.

New coverage: the agent resolution rule (R5.2) and the per-agent section set
(R3.4, R4.4) are pure functions, testable in the node environment the suite
already runs.
