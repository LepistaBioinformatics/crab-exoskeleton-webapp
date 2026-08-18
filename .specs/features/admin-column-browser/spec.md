# admin-column-browser — Specification

**Status:** Implemented
**Size:** Large (navigation replaced wholesale: one pure column model, five components
built, five deleted, URL state extended)
**Repo:** `crab-exoskeleton-webapp` only.
**Context:** `context.md` (DEC-1 … DEC-9). **Supersedes** `backoffice-admin-shell`'s
FR-1 … FR-5 and FR-10.4; the invariants it preserved are re-stated here rather than
inherited by reference.

---

## Problem

The admin screen has now been rebuilt twice and is still hard to read. The current shell
puts a rail on the left whose body means different things at different times — two
selection steps, then a list of sections — and reaches its scope through a `ScopeTree`
inside a gate, with a sticky context bar above the panel narrating what was chosen.

Three faults, and they are the same fault seen from three sides:

**The hierarchy is drawn in two grammars.** The rail nests sections under a menu item by
indentation; the tree nests subscriptions under tenants by disclosure. One hierarchy, two
idioms, neither reinforcing the other.

**One region answers different questions.** The rail's body is a step list before the
selection is complete and a section list after. Nothing on the outside of that region says
which it currently is.

**The context bar exists because the navigation does not show the path.** A second
component was needed to narrate a selection the navigation had failed to make visible —
which is the original defect, not a fix for it.

## Goals

- [ ] One navigation idiom for the whole screen: columns, each holding the children of the
      row selected in the column before it.
- [ ] The path is the navigation. No component narrates the selection on desktop because
      the navigation already shows it.
- [ ] No tree anywhere in the admin screen.
- [ ] The same model drives mobile, as a drill-down, with no second layout to keep true.
- [ ] The visual system is unchanged — tokens, type scale and `cva` exactly as they are.

## Out of Scope

| Item | Reason |
| --- | --- |
| Panel internals (files, secrets, skills, identity, models, config, members, branding) | Navigation replacement. The panels keep their props and behaviour; they change container, not content. |
| The selection RULES established by `backoffice-admin-shell` | No default scope, both lists resolved before drawing, unknown URL values resolving to null, the legacy store's read-only-except-delete: all preserved, re-stated in FR-7. |
| The invite/members work from `backoffice-admin-shell` | The agent still arrives from the selection; the confirmation still names all four values. Unchanged. |
| Proxy and mycelium APIs | Nothing server-side changes. |
| Why a staff caller may have no scopes | Answered by the empty-state work; FR-8.4 keeps that explanation reachable. |

---

## User Stories

### P1: I can see the whole path at once ⭐ MVP

**User Story**: As an admin, I want the screen to show agent, tenant, subscription and
section as a path I walked, so I never have to hunt for what is selected.

**Acceptance Criteria**:

1. WHEN a section's panel is open THEN every column that produced it SHALL be on screen
   with its selected row marked.
2. WHEN a column is not the active one THEN its selected row SHALL be drawn more quietly
   than the active column's, so "where I am" and "how I got here" are distinguishable.
3. WHEN the strip is too wide for the viewport THEN it SHALL scroll horizontally, and the
   panel SHALL keep its width.

**Independent Test**: Open any section and read the target off the columns alone, with no
other component on screen naming it.

---

### P2: Clicking opens the next column ⭐ MVP

**User Story**: As an admin, I want each click to open the next choice to the right, so the
screen feels continuous instead of modal.

**Acceptance Criteria**:

1. WHEN a branch row is clicked THEN the column to its right SHALL show that row's
   children, and any columns beyond SHALL close.
2. WHEN a leaf row is clicked THEN no column SHALL open and the panel SHALL show its
   content.
3. WHEN a new column opens beyond the viewport THEN the strip SHALL scroll to bring it
   into view.

**Independent Test**: Walk root → agent → tenant → subscription → section; each click adds
exactly one column.

---

### P3: Branding is one click ⭐ MVP

**User Story**: As an admin, I want branding — which applies to the whole instance — to
open immediately, without asking me for a scope it does not have.

**Acceptance Criteria**:

1. WHEN `Branding` is clicked THEN NO column SHALL open to its right.
2. WHEN `Branding` is selected THEN its panel SHALL occupy the whole content area beside
   the root column.
3. WHEN the caller lacks branding rights THEN the row SHALL be absent.

---

### P4: The same thing works on a phone ⭐ MVP

**User Story**: As an admin on a phone, I want to drill in and back out, with the screen
telling me where I am.

**Acceptance Criteria**:

1. WHEN the viewport is below `md` THEN exactly one column (or the panel) SHALL be shown.
2. WHEN a branch is chosen THEN the view SHALL slide to the next column, with a back
   control naming the column left behind.
3. WHEN a panel is open THEN its header SHALL name the full path in words.

---

## Requirements

### FR-1 — The column model

- **FR-1.1** Navigation is an ordered list of COLUMNS. Column *n* lists the children of the
  row selected in column *n−1*; column 0 is the root.
- **FR-1.2** The columns are, in order: `root`, `agents`, `tenants`, `subscriptions`,
  `sections`. A column exists only when the row that produces it has been selected.
- **FR-1.3** Every row is a LEAF or a BRANCH. A branch opens the next column and carries a
  trailing chevron; a leaf opens none and carries none. The chevron means exactly one
  thing — "there is more to the right" — and is used for nothing else.
- **FR-1.4** Selecting a row in column *n* DISCARDS every selection in columns after *n*.
  A path cannot keep a tail that no longer descends from its head.
- **FR-1.5** The whole model is one PURE function of (authority, agents, scopes,
  selection) returning the columns and their rows, with a truth table over it. This screen
  has been rebuilt twice around navigation state that lived in a component; it does not
  live in a component again.

### FR-2 — What each column holds

- **FR-2.1** `root`: `Branding` (LEAF, first — DEC-2) and `Agents` (BRANCH). Each is
  present only when the caller can use it: branding rights, and at least one manageable
  scope respectively.
- **FR-2.2** `agents`: one BRANCH row per agent the proxy reports, then a visually
  subordinate `Legacy` group holding the all-agents store as a BRANCH.
- **FR-2.3** `tenants`: one BRANCH row per tenant the caller administers, named, with the
  id as the fallback.
- **FR-2.4** `subscriptions`: the tenant-wide row FIRST — labelled as the whole tenant, and
  present only when the caller holds that tenant's own scope — then one row per
  subscription. **All BRANCHES**: each opens the `sections` column, which is what the
  chevron means and the only thing it means. (An earlier draft called these "leaves with
  respect to scope, branches in the strip". That is a second axis with one glyph to render
  it, and a chevron meaning two things is the fault this feature exists to remove.)
- **FR-2.5** `sections`: the sections the selected agent offers, per `agent-scope.ts`,
  unchanged — `persona`/`model`/`config` are picoclaw-only, the legacy store gets neither
  those nor `members`. All LEAVES; selecting one opens the panel.
- **FR-2.6** Each column carries a heading naming the question it answers. The heading is
  the column's identity and does not change with state.
- **FR-2.7** An empty column states why it is empty rather than rendering a blank strip
  (no agents reported, no subscriptions under this tenant), through `PanelEmpty`.

### FR-3 — The strip and the panel

- **FR-3.1** At `md` and above, the columns are a horizontally scrolling strip on the left
  and the panel is pinned to the right with the remaining width (DEC-4).
- **FR-3.2** Each column has a fixed width and a body that scrolls inside itself; columns
  are separated by a hairline rule in the existing border tone.
- **FR-3.3** WHEN a column opens outside the visible strip THEN the strip scrolls to reveal
  it, and that scroll respects `prefers-reduced-motion`.
- **FR-3.4** WHEN `Branding` is selected THEN there are no intermediate columns and its
  panel takes the whole area beside the root column.
- **FR-3.5** WHILE no section is selected the STRIP takes the full content width, and the
  area to the right of the last column carries one quiet line naming the next choice. When
  a section is selected the strip yields its slack to the panel.

  Decided here rather than left to whichever CSS lands first: with a permanently pinned
  panel, four of the five clicks in a walk would face a large empty region. Finder itself
  shows blank columns to the right of the deepest one — the slack is honest, it says "more
  opens here" — but an admin tool earns the one line that names what to click.

### FR-4 — The panel header

- **FR-4.1** The panel has a header that does not scroll with its content. It carries the
  section's name and the restart control.
- **FR-4.1.1** The panel header is where `scopeLabel` and the restart `target` are computed
  now. The context bar computed them and is being deleted; naming the owner here keeps the
  values from being recomputed in two places, which is how the header and the confirmation
  copy would come to disagree about what a bounce hits.
- **FR-4.2** The restart control keeps its behaviour from `backoffice-admin-shell` FR-10:
  ONE mount point, readable without opening anything, present-and-saying-so where the
  section needs no delivery (`sectionNeedsDelivery`), and the invalid-policy block gated on
  that same predicate so `files` and `members` are never locked by it. Only its LOCATION
  changes — from the context bar to this header.
- **FR-4.3** Below `md` the header ALSO carries the path in words (`alpha · Innovation ›
  Marketing Squad`), because only one column is on screen there. At `md` and above it does
  not: the columns already say it (DEC-5).
- **FR-4.4** The per-section "what a write here reaches" sentence is retired on desktop for
  the same reason, and survives below `md` as the path line of FR-4.3 plus the section's
  own caveat where it carries one — `model`'s proxy-wide inventory and `members`'
  subscription-scoped roster keep their sentences on every breakpoint, because those say
  something the path does NOT say.

### FR-5 — Mobile

- **FR-5.1** Below `md` exactly one pane is visible: a column, or the panel.
- **FR-5.2** Moving deeper slides to the next pane; the transition respects
  `prefers-reduced-motion`, and the FIRST position never animates — a pane resolved from
  the URL on load is a starting point, not a navigation.
- **FR-5.3** Each pane past the root carries a back control naming the pane it returns to.
- **FR-5.4** Interactive rows are at least 44 CSS px tall on touch viewports.
- **FR-5.5** There is no hamburger and no drawer. The columns ARE the navigation, and a
  drawer holding a column browser would be a second navigation around the first.

### FR-6 — URL state

- **FR-6.1** `?agent=`, `?tenant=`, `?scope=` and `?tab=` carry the path, written with
  `replace` and `scroll: false`. They are the single source of truth and are not mirrored
  into component state.
- **FR-6.2** `?tenant=` is the tenant whose subscriptions column is open. WHEN `?scope=`
  resolves THEN the open tenant is DERIVED from it and `?tenant=` is ignored; `?tenant=`
  decides only when no scope is selected (DEC-8).
- **FR-6.3** Any value that resolves against nothing the caller can use yields NO selection
  at that level, and every level after it closes. The query string is user-editable and
  outlives a revoked scope or a dropped agent.
- **FR-6.4** `?tab=` naming a section the selected agent does not offer resolves to that
  agent's first section (`resolveAgentTab`, unchanged).
- **FR-6.5** Encoding and resolution are pure and unit-tested, beside the column model.

### FR-7 — Preserved invariants

Re-stated rather than inherited, because a navigation rewrite is exactly where they get
dropped:

- **FR-7.1** NO DEFAULT SCOPE. `listScopes()` selects nothing, including when the caller
  has exactly one scope. This is the fix the whole rebuild exists for.
- **FR-7.2** Nothing draws until BOTH `listAgents()` and `listScopes()` have resolved.
- **FR-7.3** `agents === null` is "not fetched"; a failed fetch resolves to `[]`, never
  staying null.
- **FR-7.4** The legacy all-agents entry keeps its subordinate group, its three content
  sections, and read-only-except-delete.
- **FR-7.5** `members` stays subscription-scoped and unfiltered by the agent; the invite
  form has no agent control and confirms tenant › subscription › agent › level.
- **FR-7.6** The branding-only caller still gets the explanation of why there is nothing
  else (`brandingOnly`), now in the root column's panel area.

### FR-8 — Deletions

- **FR-8.1** DELETED: `nav-rail.tsx`, `scope-gate.tsx`, `context-bar.tsx`,
  `scope-tree.tsx`, `agent-gate.tsx`. Their jobs are columns now.
- **FR-8.1.1** `agent-gate.tsx` carries three behaviours the agents column INHERITS rather
  than rediscovers: the `Legacy` group drawn subordinate and separate (its own rule, an
  uppercase eyebrow, a dashed row) so the store never reads as one more agent to choose;
  the fetched-and-empty notice, distinct from not-fetched-yet; and the legacy entry
  labelled by its copy, never by the `ALL_AGENTS` sentinel.
- **FR-8.1.2** `nav-rail.test.tsx` dies with its component. Its two assertions that are
  about RULES rather than that component — the legacy sentinel never being printed, and
  the branding-only caller's shape — move into the column model's truth table.
- **FR-8.2** `admin-shell.tsx` is rewritten as the column-browser shell: no drawer, no
  hamburger, no persisted collapse (FR-5.5).
- **FR-8.3** `restart-chrome.tsx` SURVIVES unchanged in behaviour and moves to the panel
  header.
- **FR-8.4** `tabs.ts`, `agent-scope.ts` and `admin-nav.ts`'s `Authority`/`brandingOnly`
  survive. `railItems`/`resolveRailItem` are replaced by the column model; `gateStep` is
  deleted with the gate.
- **FR-8.5** Copy orphaned by the deletions is removed from BOTH locales, not left behind.

### FR-9 — Accessibility

- **FR-9.1** Each column is a `<ul>` of ordinary buttons inside a labelled region, its
  accessible name taken from the column heading. The selected row carries `aria-current`.
  NOT `role="listbox"`: that role obliges managed roving focus, which FR-9.3 declines on
  purpose, and declaring a role without its keyboard contract is worse than declaring none.
- **FR-9.2** A BRANCH row carries `aria-expanded`, true when its column is the one
  currently open. The chevron is `aria-hidden` decoration; `aria-expanded` is where the
  affordance actually lives, so the row announces that it opens something and whether it
  already did.
- **FR-9.3** Keyboard: rows are ordinary buttons in DOM order, so the path is walkable with
  Tab and operable with Enter/Space. Arrow-key roving focus is NOT required.
- **FR-9.4** Long names truncate with the full value on hover/focus and never force
  horizontal page scroll; the strip's own horizontal scroll is inside the strip.
- **FR-9.5** Focus is visible on every row, using the existing focus-ring treatment.

### FR-10 — Copy

- **FR-10.1** Every new or changed string goes through `adminCopy` / `useT`, in `en` and
  `pt`, with `parity.test.ts` as the gate.
- **FR-10.2** Column headings name questions in the user's vocabulary, not the system's.
- **FR-10.3** Identifiers stay untranslated: agent keys, tab keys, model and provider
  names, secret formats.

---

## Edge Cases

- WHEN the caller has branding rights and no scopes THEN the root column shows `Branding`
  alone, selected, with the explanation from FR-7.6 in the panel area.
- WHEN the caller has scopes and no branding rights THEN the root column shows `Agents`
  alone.
- WHEN the caller has neither THEN the screen keeps its "no admin access" state and no
  columns are drawn.
- WHEN the proxy reports no agents THEN the agents column says so and still offers the
  legacy entry.
- WHEN a tenant has no subscriptions AND the caller does not hold the tenant scope THEN the
  subscriptions column is empty and says so; no section column opens.
- WHEN the legacy entry is chosen THEN the sections column holds `files`, `secrets`,
  `skills` only, and the panels are read-only except delete.
- WHEN `?scope=` and `?tenant=` disagree THEN `?scope=` wins (FR-6.2).
- WHEN a section is selected and the admin then picks a different agent THEN the tenant,
  subscription and section selections close (FR-1.4); `?tab=` survives and resolves against
  the new agent (FR-6.4).
- WHEN the restart policy is incomplete THEN only sections that deliver are blocked, and
  the control naming the cause is in the panel header, on screen.

---

## Requirement Traceability

| ID | Source |
| --- | --- |
| FR-1 | User ask ("sidebars adicionais à direita, estilo Finder", "evite trees") + DEC-1 |
| FR-2.1 | DEC-2 — the user's correction: Branding is a leaf of the root |
| FR-2.4 | DEC-3 — two columns; the tenant-wide row leads the subscriptions column |
| FR-3 | DEC-4 — panel pinned, strip scrolls |
| FR-4.3, FR-4.4 | DEC-5 — the sentence survives only where the columns are not visible |
| FR-4.2 | `backoffice-admin-shell` FR-10, location changed only |
| FR-5 | User ask ("deve funcionar no mobile também") + DEC-9 |
| FR-6.2 | DEC-8 — one value, one owner |
| FR-7 | `backoffice-admin-shell` FR-3.1, R2.5/R2.6, R4, FR-6 — preserved |
| FR-8.1 | DEC-6 — no trees, and the gates are columns now |
| FR-9, FR-10 | Quality floor + `i18n-all-screens` |

---

## Verification

- `npx tsc --noEmit` — baseline **5** errors in 4 untouched test files; the gate is
  "still 5".
- `npx vitest run` — green, including the column model's truth table.
- `yarn build` — clean.

Manual walk (no browser tooling has been available; if it is absent again this is what a
follow-up owes):

1. Fresh `/admin` → root column only.
2. `Branding` → panel across the whole area, no columns between.
3. `Agents` → agent → tenant → subscription → section, one column per click.
4. Reload at any depth → same path.
5. Change the agent mid-path → everything after it closes.
6. Phone width → one pane at a time, back controls, path in the panel header.
7. Keyboard only → Tab walks the path in order, focus visible throughout.
