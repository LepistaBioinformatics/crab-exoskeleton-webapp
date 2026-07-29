# Tasks — Agent-first admin

Gate for every task: `yarn tsc --noEmit` and `yarn vitest run` clean.

## T1 — `agent-scope.ts`, React-free

- **What:** `resolveAgent(raw, agents)` and `agentTabs(agent, agents)`, plus the
  `LEGACY_AGENT` re-export.
- **Depends on:** —
- **Reuses:** `ALL_AGENTS`, `picoclawAgentKeys` (`lib/admin.ts`), `Tab`
  (`app/admin/tabs.ts`).
- **Done when:** an unknown `?agent=` resolves to null; the legacy key resolves
  to itself; a hermes agent gets no `model`; the legacy entry gets no `model`.
- **Tests:** `agent-scope.test.ts`, the full table.
- **Requirements:** R3.4, R4.1, R4.4, R5.2

## T2 — Members leaves the section set

- **What:** drop `AGENT_TABS` from `tabs.ts`; `SECTION_KEYS` becomes the four
  agent sections. `members` and `branding` stay valid `Tab` values (they are
  modes, and `?tab=` still carries them).
- **Depends on:** —
- **Done when:** `tabs.test.ts` reflects the new set and no consumer imports
  `AGENT_TABS`.
- **Requirements:** R1.3

## T3 — `readOnly` on the three shared panels

- **What:** add `readOnly?: boolean` to `SharedFilesPanel`,
  `SharedSecretsPanel`, `SharedSkillsPanel`; suppress upload / write form /
  create+upload+save respectively. Delete, list, download, preview stay.
- **Depends on:** —
- **Done when:** every write affordance is behind the flag and nothing else is;
  default false leaves the panels byte-identical in behaviour.
- **Requirements:** R4.5

## T4 — The agent gate

- **What:** `agent-gate.tsx` — the agent list plus a subordinate `Legacy` group
  with one entry. States the empty case when the proxy reported no agents.
- **Depends on:** T1
- **Reuses:** `AgentRef`, the tree/list row treatment from `scope-tree.tsx`.
- **Done when:** it renders from `AgentRef[]` alone and emits a selected key.
- **Requirements:** R2.1, R4.2, R4.3

## T5 — i18n

- **What:** add the gate, legacy and agent-header copy to `en` and `pt`; remove
  `t.agentTarget.*` and the all-agents branch copy (`everyAgent`, and the
  `throughBefore`/`throughAfter` pairing that only that branch used).
- **Depends on:** —
- **Done when:** `AdminDict` compiles, `lib/i18n/parity.test.ts` passes, and no
  removed key is referenced.
- **Requirements:** R1.2, R3.2, R4.2

## T6 — `admin-screen.tsx`: mode + gate

- **What:** three-way `mode`; `?agent=` read and written like `?tab=`; the gate
  when no agent; the working view when one is picked, with the agent header
  replacing the picker strip; Members as its own mode with a subscriptions-only
  rail; the snap effect deleted; `readOnly` passed from the legacy branch only.
- **Depends on:** T1, T2, T3, T4, T5
- **Done when:** no path reaches a shared panel without an agent; the mode bar
  offers only usable modes; "no admin access" still renders for a caller with
  neither scopes nor branding.
- **Requirements:** R1.1, R1.4, R1.5, R2.2, R2.3, R2.5, R3.1, R3.2, R3.3, R3.5,
  R5.1, R5.3

## T7 — Delete `AgentTargetSelect`

- **What:** remove `agent-target-select.tsx` and `agent-target-select.test.tsx`.
- **Depends on:** T6
- **Done when:** no import remains.
- **Requirements:** R3.2

## T8 — Comments on the surviving sentinel

- **What:** rewrite the `ALL_AGENTS` comment in `lib/admin.ts` (legacy store key,
  not a picker sentinel) and the matching one in `lib/adminRestart.ts`.
- **Depends on:** T6
- **Done when:** neither comment describes a picker that no longer exists.
  `lib/admin.test.ts` and `lib/adminRestart.test.ts` are UNCHANGED and passing —
  the behaviour they cover is still correct.
- **Requirements:** R4.1
