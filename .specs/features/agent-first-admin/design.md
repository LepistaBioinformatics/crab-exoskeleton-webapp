# Design — Agent-first admin

## Screen shape

```
AdminScreen
├── mode bar        Agents | Members | Branding        (only the usable ones)
├── mode = agents
│   ├── no agent selected  →  AgentGate      (agents + Legacy group)
│   └── agent selected     →  agent header (name + back)
│                             ├── ScopeTree rail
│                             ├── section tabs   files secrets skills [model]
│                             └── panel
├── mode = members  →  ScopeTree rail (subscriptions) + MembersPanel
└── mode = branding →  BrandingPanel
```

## New pure module: `app/admin/agent-scope.ts`

React-free, for the same reason `sidebar-tree.ts` and `tabs.ts` are: the rules
below are where this refactor can be quietly wrong, and the suite runs
`environment: "node"`.

```ts
export const LEGACY_AGENT = ALL_AGENTS;      // re-exported name, not a new value

/** The entries the gate offers: the real agents, plus the legacy store. */
export function gateEntries(agents: AgentRef[]): {
  agents: AgentRef[];
  legacy: true;
}

/** `?agent=` → a selection, or null meaning "show the gate". */
export function resolveAgent(raw: string | null, agents: AgentRef[]): string | null

/** Which sections the selected agent offers. */
export function agentTabs(agent: string, agents: AgentRef[]): Tab[]
```

`resolveAgent` returns null for an unknown key — the gate, never an empty
working view. `LEGACY_AGENT` resolves to itself.

`agentTabs` is the one place R3.4 and R4.4 live:

- legacy → `["files", "secrets", "skills"]`
- a picoclaw agent → `["files", "secrets", "skills", "model"]`
- a hermes agent → `["files", "secrets", "skills"]`

## Mode derivation

Today `mode` is derived from `tab` (`tab === "branding" && canEditBranding`).
Members joins it on the same principle — one source, no drift:

```ts
type Mode = "agents" | "members" | "branding";
mode = tab === "branding" && canEditBranding ? "branding"
     : tab === "members" && hasSubscriptions ? "members"
     : "agents";
```

`members` falls back to `agents` rather than rendering an empty rail, matching
how `branding` already falls back for a caller without branding rights.

## The read-only panels

`SharedFilesPanel`, `SharedSecretsPanel` and `SharedSkillsPanel` take a
`readOnly?: boolean`. It suppresses the WRITE affordances only:

| Panel | Hidden under readOnly | Kept |
|---|---|---|
| files | upload | list, download, delete |
| secrets | the whole write form | name list, delete |
| skills | create, upload, save | list, preview, download, delete |

Delete stays because the legacy entry exists to empty the store. A `readOnly`
that also hid delete would be a museum, not an exit.

It is a prop and not a separate component: the read path, the error handling,
the confirm dialogs and the restart wiring are the whole of these panels, and
duplicating them to remove three buttons is how the two copies drift.

## The agent header

Replaces the box that held `AgentTargetSelect` plus the "reaches" sentence. Left
side: back control + the agent's name (or the legacy label). Right side: the
sentence, minus its all-agents branch — the `model` variant keeps its own
wording, because the inventory is proxy-wide and saying a write there "reaches
this tenant" would promise containment the inventory has not got.

## What is deleted

| Thing | Why |
|---|---|
| `agent-target-select.tsx` + test | The component IS the `allowAll` sentinel and its two hint texts |
| `AGENT_TABS` | Every section under an agent is agent-scoped now; the set is `agentTabs()` |
| the Members snap effect | The Members rail lists only subscriptions |
| `t.shell.everyAgent`, `throughBefore/After` all-agents branch | No all-agents action to describe |
| `t.agentTarget.*` (all/allAgents/onlyPrefix/appliesTo/…) | The picker they belonged to |

`ALL_AGENTS` in `lib/admin.ts` stays, with its comment rewritten: it is now the
legacy store's key rather than a picker sentinel. `lib/adminRestart.ts`'s
stripping stays; only the comment changes.

## Files

| File | Change |
|---|---|
| `app/admin/agent-scope.ts` | new — `resolveAgent`, `agentTabs`, React-free |
| `app/admin/agent-scope.test.ts` | new |
| `app/admin/agent-gate.tsx` | new — the agent list + Legacy group |
| `app/admin/admin-screen.tsx` | reworked around mode + agent gate |
| `app/admin/tabs.ts` + test | Members out of the section set |
| `app/admin/shared-files-panel.tsx` | `readOnly` |
| `app/admin/shared-secrets-panel.tsx` | `readOnly` |
| `app/admin/shared-skills-panel.tsx` | `readOnly` |
| `app/admin/agent-target-select.tsx` + test | deleted |
| `lib/admin.ts` | `ALL_AGENTS` comment |
| `lib/adminRestart.ts` | comment |
| `lib/i18n/admin.ts` | agent gate + legacy copy in, picker copy out |

## Risks

**A caller with scopes but no agents.** `listAgents()` fails soft today (empty
list, picker still offered "All agents"). Under agent-first an empty list means
the gate has nothing but the Legacy entry. That is the honest rendering — it
says the proxy reported no agents — and the legacy entry still reaches whatever
is stored. The gate states it rather than showing a bare list.

**`?tab=model` with a hermes agent selected.** The tab set is per agent, so the
URL can name a section the agent does not offer. Resolved the way `parseTab`
resolves garbage: fall back to the first tab the agent does offer.

**Read-only leaking into the real agents.** `readOnly` defaults to false and is
passed exactly once, from the legacy branch. The alternative — deriving it
inside each panel from `scope.agent === ALL_AGENTS` — puts the same condition in
three places and lets them disagree.
