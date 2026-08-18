# backoffice-admin-shell — Design

**Spec**: `.specs/features/backoffice-admin-shell/spec.md`
**Context**: `.specs/features/backoffice-admin-shell/context.md`
**Status**: Implemented

---

## Architecture Overview

`admin-screen.tsx` is 705 lines that own everything: fetching, URL state, the mode
bar, the tab strip, the scope rail and its resize, the restart accordion, and the
panel switch. This design keeps it as the ONE owner of state and turns the rest into
presentational children, with every derivation rule in a pure module beside it.

```
AdminScreen (state owner: fetches, URL, restart policy)
│
├── admin-nav.ts ......... PURE: rail items, gate step, scope encode/parse
├── tabs.ts .............. PURE: rail item resolution, section set, delivery need
├── agent-scope.ts ....... PURE: which sections an agent offers
│
└── AdminShell ........... two columns + mobile drawer
    ├── NavRail .......... brand header · nav body · footer
    │   └── body = gate progress (incomplete) | section list (complete)
    └── content
        ├── ContextBar ... agent · scope · change controls · reaches sentence
        │   └── RestartChrome ... the always-visible policy + notice
        └── AgentGate | ScopeGate | <the section's panel>
```

Data flow is unchanged: `listAgents()` and `listScopes()` on mount, `?agent=`,
`?scope=` and `?tab=` as the single source of truth, panels receiving a `ScopeRef`.

### The three states of the working area

| `agent` | `scope` | Content area | Rail body |
| --- | --- | --- | --- |
| null | — | `AgentGate` | step list, step 1 current |
| set | null | `ScopeGate` | step list, step 2 current, step 1 showing the agent |
| set | set | `ContextBar` + panel | section list |

`branding` sits outside this table entirely: it is a rail item, renders
`BrandingPanel` with no context bar, and leaves `?agent=`/`?scope=` untouched
(FR-2.7).

---

## Code Reuse Analysis

### Existing components to leverage

| Component | Location | How it is used |
| --- | --- | --- |
| `AgentGate` | `app/admin/agent-gate.tsx` | Step 1, essentially as-is. Gains a step eyebrow; keeps the legacy group and the empty-list notice verbatim. |
| `ScopeTree` | `app/admin/scope-tree.tsx` | Reused inside `ScopeGate` (step 2) and inside the context bar's scope switcher. Survives DEC-7. |
| `RestartPolicySelect` | `app/admin/restart-policy-select.tsx` | Mounted by `RestartChrome` instead of by each section's `Accordion`. Unchanged. |
| `RestartNoticeBlock` | `app/admin/restart-notice.tsx` | Same. Its `target`/`scopeLabel` props already match what the context owns. |
| `ConfirmDialog` | `components/ui/confirm-dialog.tsx` | The invite confirmation (FR-6.4). Already used by revoke in the same panel. |
| `PanelEmpty` | `components/ui/panel-empty.tsx` | The blocked-Members state (FR-5.4) and the gate's empty cases. Closes the STATE.md deferred idea for exactly the states this feature creates. |
| Drawer idiom | `app/chat/chat-shell.tsx:228-251` | Hamburger + backdrop + `md:hidden`, copied in structure so `/admin` and `/chat` behave identically on a phone. |
| `resolveScopeNames` | `lib/admin.ts` | Unchanged: names still resolve before the tree draws, so no uuid flash in the gate or the context bar. |
| `cva` | `class-variance-authority` | Every variant. The repo forbids inline conditional/interpolated `className`. |

### Integration points

| System | Integration |
| --- | --- |
| `/api/admin/scopes`, `/api/admin/agents` | Unchanged calls, unchanged failure handling (`agents` fails soft to `[]`). |
| `lib/invitations.ts` | `resolveRoleId(roles, agent, level)` now takes the context's agent instead of the form's. No signature change. |
| `lib/admin.ts` `InstanceRef` | Already carries `agent`; the members panel now receives the context's agent to default it. |
| `lib/adminRestart.ts` | Unchanged, including the `ALL_AGENTS` stripping the legacy entry relies on. |

---

## Components

### `admin-nav.ts` (new, pure)

- **Purpose**: every derivation the new navigation needs, testable without mounting React.
- **Location**: `app/admin/admin-nav.ts` (+ `admin-nav.test.ts`)
- **Interfaces**:
  - `encodeScope(scope: ScopeRef): string` — `t:<tenantId>` | `s:<tenantId>:<subsAccId>`.
    The existing `scopeKey` shape minus the agent segment, so the two read alike.
  - `resolveScope(raw: string | null, scopes: AdminScope[]): ScopeRef | null` — matches
    against the manageable list; anything unknown yields `null` (FR-7.2).
  - `gateStep(agent: string | null, scope: ScopeRef | null): "agent" | "scope" | null`
  - `railItems(a: Authority): RailItem[]`
- **Dependencies**: `lib/admin` types only.
- **Reuses**: the `scopeKey` encoding convention.

### `tabs.ts` (modified, pure)

- `AdminMode` → `RailItem = "workspaces" | "branding"`; `resolveMode` → `resolveRailItem`.
  The `agents` mode is absorbed into `workspaces`; `members` stops being a mode.
- `SECTION_TABS` gains `"members"`, placed LAST — it is the section about people, and
  the content sections read as a group.
- New: `sectionNeedsDelivery(tab: Tab): boolean` — `false` for `files` (a live
  read-only mount, no bounce) and for `members` (its writes carry their own per-instance
  policy inside `InstanceConfigEditor`, verified: `instance-config-editor.tsx:290`),
  `true` otherwise. This is what FR-10.5 and FR-10.6.1 key off, and it is the ONLY
  place the question is answered.

### `agent-scope.ts` (modified, pure)

- `agentTabs` adds `members` for a real agent and withholds it from the legacy entry
  (FR-5.3): no guest role is named for `ALL_AGENTS`, so an invitation through it could
  not be constructed. `PICOCLAW_ONLY` is unchanged; `members` joins the content set for
  real agents only, which needs one explicit branch rather than a derived filter —
  spelled out with the reason, since the two-list derivation would otherwise hide it.

### `AdminShell` (new)

- **Purpose**: the two-column frame and the mobile drawer.
- **Location**: `app/admin/admin-shell.tsx`
- **Interfaces**: `({ rail, children }: { rail: ReactNode; children: ReactNode })`
- **State it owns**: drawer open (mobile), rail collapsed (desktop, persisted under an
  `admin-rail` localStorage key, read in an effect so SSR and the first client render
  agree). Nothing else — the selection lives in `AdminScreen`.
- **Behaviour**: `Escape` and backdrop close the drawer; focus enters the drawer on open
  and returns to the hamburger on close (FR-8.2); transitions carry
  `motion-reduce:transition-none` (FR-8.7).
- **Reuses**: `chat-shell.tsx`'s drawer structure.

### `NavRail` (new)

- **Purpose**: the navigation body — the merged menu, its steps or sections, and Branding.
- **Location**: `app/admin/nav-rail.tsx`
- **Interfaces**:
  `({ items, active, step, agent, scopeLabel, sections, section, collapsed, onSelectItem, onSelectSection, onGoToStep })`
- **Notes**: renders `<nav aria-label>`; the active section carries `aria-current="page"`;
  the collapsed form keeps accessible names on icon-only items (FR-8.3). It renders no
  restart control (FR-10.4) — at most a control that focuses the one in the context bar.

### `ScopeGate` (new)

- **Purpose**: step 2 — choosing the tenant/subscription, deliberately.
- **Location**: `app/admin/scope-gate.tsx`
- **Interfaces**: `({ scopes, agent, onSelect, onBack })`
- **Notes**: states which agent the scope is being chosen for (FR-3.3). Wraps
  `ScopeTree`; each entry names the tenant and, for a subscription, the subscription
  (FR-3.2). No default and no pre-highlight, including with a single scope (FR-3.1).

### `ContextBar` (new)

- **Purpose**: the target, permanently on screen.
- **Location**: `app/admin/context-bar.tsx`
- **Interfaces**: `({ agent, legacy, scope, scopeLabel, scopes, section, onChangeAgent, onChangeScope, children })`
- **Notes**: sticky at the top of the content column; two labelled controls, never one
  (FR-4.3); the "reaches" sentence per section, moved verbatim from `admin-screen.tsx`
  with the new `members` branch (FR-4.5); a polite live region announces context changes
  (FR-4.6). `children` is where `RestartChrome` mounts — one mount point, all
  breakpoints.

### `RestartChrome` (new)

- **Purpose**: the delivery policy, always readable, never inside a section.
- **Location**: `app/admin/restart-chrome.tsx`
- **Interfaces**: `({ policy, onChange, target, scopeLabel, needsDelivery })`
- **Notes**: no `Accordion` — the policy in force must be readable without opening
  anything (FR-10.2). Compact by default: the mode is stated inline with a control to
  change it, and `RestartNoticeBlock` sits beside it. `needsDelivery === false` renders
  the same block saying this section needs no restart, rather than unmounting (FR-10.5).
  The invalid-policy error renders here, where the cause is.

### `MembersPanel` (modified)

- Gains `agent: string` and renders the blocked state when `scope.kind === "tenant"`
  (FR-5.4) via `PanelEmpty`, with a control that opens the scope switcher.
- Instance rows: the context's agent first; a row for another agent is marked
  out-of-context (FR-6.5.1) so it can never be read as the current target.
- The FR-7 privacy invariant is untouched: still no path to a private file's bytes.

### `InviteMember` (modified)

- Loses its agent `<select>` and its `agents` state; takes `agent` from the context.
- Keeps the level control and the "no role declared for this agent" state (FR-6.3).
- Submitting opens `ConfirmDialog` naming tenant, subscription, agent and level; the
  RPC fires only on confirm (FR-6.4).

---

## Data Models

```typescript
// app/admin/admin-nav.ts
export type RailItem = "workspaces" | "branding";
export type GateStep = "agent" | "scope";

export interface Authority {
  hasScopes: boolean;
  canEditBranding: boolean;
}
```

`Authority` loses `hasSubscriptions`: it existed to decide whether the `members` MODE
was offered. With `members` a section of a selected scope, the question is answered
per selection (FR-5.4), not per caller — one derived flag fewer to keep true.

---

## Error Handling Strategy

| Scenario | Handling | User impact |
| --- | --- | --- |
| `listAgents()` fails | Resolves to `[]` (never stays `null` — the screen holds a spinner on null) | Step 1 says the proxy reported no agents; the legacy entry still works |
| `listScopes()` fails | Existing behaviour: `session expired` → `/signin`, otherwise an error Alert | Unchanged |
| `?agent=` unknown | `resolveAgent` → `null` | Step 1 |
| `?scope=` unknown or revoked | `resolveScope` → `null`, agent preserved | Step 2, no error banner (the query string is user-editable) |
| Section not offered by the agent | `resolveAgentTab` → the agent's first section | Lands somewhere real |
| Invalid restart policy | Blocks only sections where `sectionNeedsDelivery` is true | The cause is on screen in the context bar, not inside a collapsed accordion |
| No role declared for the context's agent | Invite form states it, naming the agent, and does not submit | Unchanged copy, reached through the context |

---

## Tech Decisions

**The rail replaces two rows of navigation, not one.** The mode bar and the section
strip were levels 1 and 2 of the same tree; a rail expresses that with nesting instead
of with two visual idioms (a filled segmented control above an underlined tab strip)
that had to be kept different from each other on purpose. That difference no longer has
to be maintained.

**The gate steps live in the rail, not only in the content area.** The rail is the
screen's spine, and showing "1 Agent ✓ alpha / 2 Scope" there makes the two-step shape
visible before, during and after the choice — which is what turns a selection into
something the admin remembers making.

**`Authority.hasSubscriptions` is deleted rather than kept for the section list.** Under
DEC-3 the `members` section is offered for any real agent and blocks on a tenant scope,
so a caller-level flag would answer a question nobody asks any more.

**Scope stays out of component state.** `?scope=` is read and resolved on every render,
like `?agent=`. A `useState` mirror is how the URL and the screen drift, and this screen
is being rebuilt precisely because a selection nobody could see was allowed to exist.

---

## Testing Strategy

The suite runs `environment: "node"` with component tests written against
`renderToStaticMarkup` — so anything that must be verified belongs in a pure module or
in static output.

| Unit | Where | What it proves |
| --- | --- | --- |
| `nav-rail.test.tsx` | new static test | the collapsed form still carries the sections; the steps replace them while the selection is incomplete; the legacy sentinel is never printed |
| `admin-nav.test.ts` | new | scope encode/parse round-trip; unknown/revoked scope → `null`; `gateStep` truth table; `railItems` per authority |
| `tabs.test.ts` | rewritten | `resolveRailItem` truth table (branding-only caller, scopes-only, both, neither); `sectionNeedsDelivery` per tab |
| `agent-scope.test.ts` | extended | `members` present for a real agent, absent for the legacy entry; picoclaw-only set unchanged |
| `invite-member` | new jsdom test | no agent control at all; another agent is unreachable; the confirmation names all four values; nothing is sent before it is accepted |
| `members-panel` | new static test | tenant scope renders the blocked state, through `PanelEmpty`, with a way out |
| `members-instances` | new jsdom test | the context's agent is first and marked; another agent's row is marked as such |
| `lib/i18n/parity.test.ts` | existing gate | every new key exists in `en` and `pt` |

Gate per task: `npx tsc --noEmit` (baseline **5** pre-existing errors in untouched test
files — the gate is "still 5"), `npx vitest run`, and `yarn build`.
