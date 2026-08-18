# admin-column-browser — Design

**Spec**: `spec.md` · **Context**: `context.md` · **Status**: Implemented

---

## Architecture

One pure module produces the whole navigation; everything else renders it.

```
AdminScreen (state owner: fetches, URL, restart policy)
│
├── columns.ts ........ PURE. (authority, agents, scopes, selection) -> Column[]
│                       plus the mobile pane rule. Truth table over both.
├── admin-nav.ts ...... PURE. scope/tenant encode+resolve, Authority, brandingOnly
├── tabs.ts ........... PURE. root item resolution, section set, sectionNeedsDelivery
├── agent-scope.ts .... PURE. which sections an agent offers
│
└── ColumnBrowser ..... the strip (md+) / one sliding pane (below md)
    ├── ColumnView × n  heading · rows · empty state
    └── panel area
        ├── PanelHeader  section name · path (below md) · RestartChrome
        └── <the section's panel>
```

`AdminScreen` keeps its fetches, its URL setters and the restart policy. It gains no
navigation logic: it hands `columns.ts` what it knows and renders what comes back.

## The model

```typescript
export type ColumnKey = "root" | "agents" | "tenants" | "subscriptions" | "sections";

export interface ColumnRow {
  /** Click payload and React key. Namespaced per column, so ids never collide. */
  id: string;
  /** Text the SYSTEM owns: an agent key, a tenant or subscription name. */
  text?: string;
  /** Copy key, when the row's name is prose. Exactly one of text/textKey is set. */
  textKey?: RowTextKey;
  hintKey?: RowHintKey;
  /** Opens the next column. Drives the chevron AND aria-expanded — one bit, one meaning. */
  branch: boolean;
  selected: boolean;
  /** `legacy` draws subordinate; it must never read as one more agent to choose. */
  tone: "normal" | "legacy";
  icon: RowIcon;
}

export interface Column {
  key: ColumnKey;
  rows: ColumnRow[];
  /** Named when the column resolved to nothing — never a blank strip. */
  empty?: "noAgents" | "noSubscriptions" | "noTenants";
}
```

The module returns KEYS, never copy: it is unit-tested under `environment: "node"` where
there is no locale context, and copy that leaked in here would be untestable and
untranslatable. `ColumnView` resolves `textKey`/`hintKey`/`key` against `adminCopy`.

`text` vs `textKey` is the same split the rest of the screen already makes: agent keys and
account names are identifiers and land verbatim; everything else is prose.

## Which columns exist

| Column | Exists when | Rows |
| --- | --- | --- |
| `root` | always (with any authority) | `Branding` (leaf, first) and `Agents` (branch), each gated on its own authority |
| `agents` | root is `Agents` | one branch per agent, then the subordinate `Legacy` entry |
| `tenants` | an agent is selected | one branch per distinct tenant among the caller's scopes |
| `subscriptions` | a tenant is selected | the tenant-wide row first (only if the caller holds that tenant's own scope), then one per subscription — all branches |
| `sections` | a scope is selected | `agentTabs(agent, agents)`, all leaves |

Selecting a row discards every selection after it (FR-1.4) — enforced in `AdminScreen`'s
setters as a single batched URL write, not by clearing state after the fact.

## Mobile

`resolvePane({ deepest, back })` — the same shape as `app/chat/sidebar-panel-state.ts`'s
`resolvePanel`, and for the same reason: the visible pane is DERIVED from the selection,
with one override for "the user pressed back". `back` is cleared by any selection, so it
cannot outlive the path that justified it.

Back does NOT deselect. Going back to look at the sections list must not lose the section
you are in — that is browsing, not unpicking.

The slide reuses `unified-sidebar.tsx`'s track rule, including `armed`: the first position
is a starting point, not a navigation, so it must not animate.

## Code reuse

| What | From | How |
| --- | --- | --- |
| Track + `armed` transition | `app/chat/unified-sidebar.tsx` | The mobile pane slide, generalised from 2 panes to N |
| Derived-pane-with-override | `app/chat/sidebar-panel-state.ts` | `resolvePane` mirrors `resolvePanel` |
| `PanelEmpty` | `components/ui/panel-empty.tsx` | Every empty column and the pre-section placeholder |
| `RestartChrome` | `app/admin/restart-chrome.tsx` | Survives intact; moves to `PanelHeader` |
| `agentTabs` / `resolveAgentTab` | `app/admin/agent-scope.ts` | The sections column, unchanged |
| `brandingOnly`, `Authority`, scope encode/resolve | `app/admin/admin-nav.ts` | Kept; `railItems`/`gateStep` go |
| Row/active treatment | `scope-tree.tsx`'s `nodeButton`, `nav-rail.tsx`'s `row` | The tone vocabulary survives its components |
| Legacy group treatment | `agent-gate.tsx` | Inherited by the agents column (FR-8.1.1) |

## Components

**`ColumnView`** — `{ column, onSelect }`. A labelled region, a heading, a `<ul>` of
buttons. Fixed width, body scrolls inside itself. Branch rows carry `aria-expanded`; the
chevron is `aria-hidden`. Rows are `min-h-11` for touch. No domain knowledge: it renders
whatever `Column` it is handed.

**`ColumnBrowser`** — `{ columns, pane, panel, onSelect, onBack }`. At `md`+ a scrolling
strip plus the pinned panel; below `md` one pane on a track. Owns the scroll-into-view of a
newly opened column and nothing else.

**`PanelHeader`** — `{ section, path, target, scopeLabel, policy, onPolicyChange }`.
Non-scrolling. Section name; the path in words below `md` only (FR-4.3); `RestartChrome`.
It is the single owner of `scopeLabel` and the restart `target` (FR-4.1.1).

**`AdminScreen`** — fetches, URL, restart policy, and the panel switch. Loses the shell,
the rail, both gates and the context bar.

## Deleted

`nav-rail.tsx`, `nav-rail.test.tsx`, `scope-gate.tsx`, `context-bar.tsx`, `scope-tree.tsx`,
`agent-gate.tsx`, `admin-shell.tsx`.

`admin-shell.tsx` goes rather than being rewritten: with no drawer, no hamburger and no
persisted collapse (FR-5.5), what remained of it was a two-column flex box, and
`ColumnBrowser` is that box. `railItems`/`resolveRailItem`'s rail semantics collapse into
the root column; `gateStep` dies with the gate.

## Testing

`environment: "node"`, component tests via `renderToStaticMarkup`, jsdom only where an
effect is load-bearing.

| Unit | Proves |
| --- | --- |
| `columns.test.ts` | which columns exist per selection; the tenant-wide row's presence rule; leaf/branch per row; discard-after-selection; the legacy entry subordinate and never printed as `ALL_AGENTS`; branding-only shape (inherited from `nav-rail.test.tsx`, FR-8.1.2); `resolvePane` truth table |
| `column-view.test.tsx` | heading names the column; selected row carries `aria-current`; branch rows carry `aria-expanded` and leaves do not; empty column states its reason through `PanelEmpty` |
| `admin-nav.test.ts` | extended: `?tenant=` encode/resolve, and scope winning over tenant |
| `parity.test.ts` | every new key in `en` and `pt` |

Gate per task: `npx tsc --noEmit` (baseline **5**), `npx vitest run`, `yarn build`.
