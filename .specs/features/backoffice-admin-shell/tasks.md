# backoffice-admin-shell — Tasks

**Design**: `.specs/features/backoffice-admin-shell/design.md`
**Status**: Done

Gate for every task: `npx tsc --noEmit` (baseline **5** pre-existing errors in untouched
test files — the gate is "still 5", never "zero") and `npx vitest run` green.

---

## Execution Plan

```
Phase 1 — pure rules (must be first; everything reads them)
  T01 ─┐
  T02 ─┼─→
  T03 ─┘

Phase 2 — copy (every component below reads it)
  → T04

Phase 3 — presentation (independent of each other)
  T05  T06  T07  T08  T09  T10

Phase 4 — panels
  T11 → T12

Phase 5 — wiring
  → T13

Phase 6 — verification
  → T14
```

---

### T01: Pure navigation module

**What**: `encodeScope`, `resolveScope`, `gateStep`, `railItems`, `Authority`.
**Where**: `app/admin/admin-nav.ts`, `app/admin/admin-nav.test.ts`
**Depends on**: None
**Reuses**: `scopeKey`'s encoding shape, `lib/admin` types
**Requirement**: FR-7.1, FR-7.2, FR-7.5, FR-2.2
**Done when**: encode/parse round-trips for both scope kinds; an unknown or revoked
`?scope=` yields `null`; `gateStep` covers all four (agent, scope) combinations;
`railItems` filters by authority.
**Tests**: co-located unit (node)

### T02: Rail item and delivery rules in `tabs.ts`

**What**: `AdminMode`→`RailItem`, `resolveMode`→`resolveRailItem`, `members` into
`SECTION_TABS`, new `sectionNeedsDelivery`.
**Where**: `app/admin/tabs.ts`, `app/admin/tabs.test.ts`
**Depends on**: None
**Requirement**: FR-2.1, FR-2.2, FR-5.1, FR-10.5, FR-10.6.1
**Done when**: the truth table covers branding-only / scopes-only / both / neither, and
`sectionNeedsDelivery` is false for `files` and `members`, true for the rest.
**Tests**: rewritten truth table

### T03: `members` in the agent's section set

**What**: `agentTabs` offers `members` for a real agent, never for the legacy entry.
**Where**: `app/admin/agent-scope.ts`, `app/admin/agent-scope.test.ts`
**Depends on**: T02
**Requirement**: FR-5.2, FR-5.3
**Tests**: extended cases

### T04: Copy

**What**: rail labels and group headings, step eyebrows, context-bar labels and the
`members` "reaches" sentence, restart-chrome copy incl. the no-restart-needed line,
Members' blocked-tenant state, the invite confirmation, the out-of-context instance
mark. Delete keys orphaned by the mode bar and the invite agent select.
**Where**: `lib/i18n/admin.ts`
**Depends on**: T01, T02
**Requirement**: FR-9.1, FR-9.2, FR-9.3
**Done when**: `lib/i18n/parity.test.ts` passes with `en` and `pt` complete.
**Tests**: existing parity gate

### T05: Shell frame and mobile drawer

**What**: `AdminShell` — two columns, hamburger app bar below `md`, backdrop, `Escape`,
focus return, persisted rail collapse.
**Where**: `app/admin/admin-shell.tsx`
**Depends on**: T04
**Reuses**: `app/chat/chat-shell.tsx:228-251`
**Requirement**: FR-1.1, FR-1.2, FR-1.3, FR-8.1, FR-8.2, FR-8.3, FR-8.7

### T06: The rail body

**What**: `NavRail` — items, groups, gate progress, section list, `aria-current`,
collapsed icon form with accessible names.
**Where**: `app/admin/nav-rail.tsx`
**Depends on**: T04
**Requirement**: FR-2.1 … FR-2.7, FR-8.5, FR-8.6

### T07: Step 2 — the scope gate

**What**: `ScopeGate` — names the agent it is choosing for, no default, no pre-highlight.
**Where**: `app/admin/scope-gate.tsx`
**Depends on**: T04
**Reuses**: `ScopeTree`, `PanelEmpty`
**Requirement**: FR-3.2, FR-3.3

### T08: Restart chrome

**What**: `RestartChrome` — policy readable without opening anything, notice beside it,
the not-applicable form, the invalid-policy error.
**Where**: `app/admin/restart-chrome.tsx`
**Depends on**: T02, T04
**Reuses**: `RestartPolicySelect`, `RestartNoticeBlock`
**Requirement**: FR-10.1, FR-10.2, FR-10.5, FR-10.6

### T09: Context bar

**What**: `ContextBar` — sticky target, two labelled change controls, per-section
"reaches" sentence, live region, slot for T08.
**Where**: `app/admin/context-bar.tsx`
**Depends on**: T04
**Reuses**: `ScopeTree` (switcher), the sentence moved from `admin-screen.tsx`
**Requirement**: FR-4.1 … FR-4.6, FR-10.4

### T10: Agent gate step eyebrow

**What**: `AgentGate` states that it is step 1 of two; everything else unchanged.
**Where**: `app/admin/agent-gate.tsx`
**Depends on**: T04
**Requirement**: FR-3.2, FR-3.3

### T11: Invite inherits the agent and confirms

**What**: remove the agent `<select>` and its state; take `agent` as a prop; confirm
before sending, naming tenant, subscription, agent, level.
**Where**: `app/admin/invite-member.tsx`, `app/admin/invite-member.test.tsx`
**Depends on**: T04
**Reuses**: `ConfirmDialog`, `resolveRoleId`
**Requirement**: FR-6.1 … FR-6.4
**Tests**: static render — no agent control in the output; the confirmation names all
four values

### T12: Members as a section

**What**: `agent` prop; blocked state on a tenant scope; instance rows ordered with the
context's agent first and out-of-context rows marked.
**Where**: `app/admin/members-panel.tsx`, `app/admin/members-panel.test.tsx`
**Depends on**: T11
**Reuses**: `PanelEmpty`
**Requirement**: FR-5.4, FR-6.5, FR-6.5.1, FR-6.6
**Tests**: static render — blocked state on tenant; out-of-context mark present

### T13: Wire the screen

**What**: rewrite `admin-screen.tsx` around the shell: remove the mode bar, the tab
strip, the scope rail, `startResize`/`railWidth`, and the per-section restart accordion;
add `?scope=`; stop auto-selecting `scopes[0]`; route the three states of the working
area.
**Where**: `app/admin/admin-screen.tsx`
**Depends on**: T01 … T12
**Requirement**: FR-1.4, FR-1.5, FR-3.1, FR-3.4 … FR-3.8, FR-5.5, FR-5.6, FR-7.3
**Done when**: no reference to `railWidth`, `startResize` or `availableModes` remains,
and no panel is reachable without both `?agent=` and `?scope=` resolving.

### T14: Gate and record

**What**: full gate, then record in `.specs/project/STATE.md` what was verified and what
still needs a browser.
**Where**: `.specs/project/STATE.md`
**Depends on**: T13
**Done when**: `npx tsc --noEmit` still reports the 4 baseline errors and nothing else;
`npx vitest run` is green; the manual walk in `spec.md` is recorded as pending or done.
