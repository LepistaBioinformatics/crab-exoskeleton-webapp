# per-agent-injection-scope — Specification (webapp)

Webapp half of the proxy feature of the same name
(`crab-shell-proxy/.specs/features/per-agent-injection-scope/`). Read that spec
for the storage layout and cascade; this one covers the BFF and the admin UI.

## Problem

Every `/api/admin/*` route hardcodes a single vehicle (`ADMIN_BASE =
"/alpha/v1/admin"`) with a comment stating shared content is agent-agnostic. It
was: publishing a skill or secret at a scope handed it to every agent. Admins had
no way to say "this one is for alpha only" — unlike the Model tab, whose registry
is per-agent.

## Requirements

- **R1** The BFF forwards an `agent` parameter on every scope-addressed
  shared-content route: `admin/shared`, `admin/shared/content`,
  `admin/shared-secrets`, `admin/skills`, `admin/skills/doc`,
  `admin/skills/archive`. Omitted or `all` keeps today's behaviour.
- **R2** A new `GET /api/admin/agents` proxies the proxy's `/v1/admin/agents`,
  returning the configured agent keys.
- **R3** `INSTANCES = ["alpha","beta"]` stops driving the admin UI. The agent list
  comes from R2, so adding an agent to the proxy's `config.yaml` is enough for it
  to appear as a target. (This resolves `OPEN-3` in `model-list-management`.)
- **R4** One agent-target control, rendered above the panel and **shared** by every
  agent-scoped tab — Shared files / Shared secrets / Shared skills **and Model** —
  so the choice survives tab switches and the control is identical in all of them.
  Options: **All agents** (default) and one entry per agent.
  - The **Members** tab shows no agent control — it is not agent-scoped.
  - See R8 for what "All agents" means in the Model tab, where it cannot mean the
    same thing.
- **R5** The control states what the choice means: all-agents content is read by
  every agent; an agent-specific entry overrides the all-agents one of the same
  name.
- **R6** Switching the agent target reloads the panel's listing (the target is
  part of the scope identity, not a display-only toggle).
- **R7** If `GET /api/admin/agents` fails, the picker degrades to **All agents**
  only. It never blocks the screen — the default is the safe, pre-feature
  behaviour.

### R8 — the Model tab uses the same control, with read-only "all"

The model registry is per-agent **by construction**: `listRegisteredModels` /
`deleteRegisteredModel` / `applyRegisteredModel` each address one agent, a catalog
entry and its API key live in that agent's config, and there is no gateway service
behind an "all agents" registry. So "All agents" here is an **aggregated read**,
not a write target (user decision, 2026-07-25):

- **Listing** fans out over the agents in range and tags each entry with the agent
  whose catalog it came from (badge shown only in the aggregated view). Delete uses
  the entry's own agent, so it stays correct in either view.
- **Registering** always names one agent. With a single agent targeted that is the
  target; in the aggregated view the form shows a "Register into" select, so the
  admin never has to leave the aggregated view to add a model.
- **Assign to users**: the aggregated view lists every user of the subscription and
  offers each row only the models registered for **that user's own agent** —
  applying with `u.role`, the only catalog their workspace can resolve a model
  from. A user whose agent has no models gets a disabled picker saying so, not an
  empty dropdown.
- The rejected alternative was fan-out writes (register into every catalog). It
  introduces partial failure — written to alpha, failed on beta — for no stated
  need.

**Visible behaviour change:** the Model tab used to open on the first agent
(`useState(agents[0])`). It now inherits the shared target, so it opens on the
**aggregated view**, issuing one `listRegisteredModels` per agent on first paint.
That is the consistency the change is for, but it is the first thing an existing
admin will notice.

The picker's only per-tab difference is its hint copy, selected by a
`purpose: "content" | "registry"` prop.

### R9 — the active tab lives in the URL

- **R9.1** The active section is `?tab=<key>`; a reload, a shared link and Back all
  land on the same tab.
- **R9.2** The URL is the **single source of truth** — the tab is derived from the
  search param, never mirrored into component state. Both existed, they would drift
  the moment one of the screen's snapping effects (the members-scope snap, the
  branding-only snap) changed the tab.
- **R9.3** `router.replace`, not `push`: tab switches must not stack history
  entries, or Back walks every tab the admin touched instead of leaving the screen.
  `scroll: false` so switching does not jump the page.
- **R9.4** An absent or unrecognized value resolves to the default tab. The query
  string is user-editable, so `?tab=garbage` must render a real panel.
- **R9.5** `AdminScreen` is wrapped in `<Suspense>`. `/admin` is currently a dynamic
  route (`ƒ` in the build output, verified), so `useSearchParams` needs no boundary
  today — the wrapper costs one line and makes it a build-time non-issue if the
  route ever becomes prerendered.

## Design

- `lib/adminProxy.ts` — exports `ADMIN_SCOPES` / `isAdminScope` /
  `adminScopeQuery(scope, tenantId, subsAccId, agent)`. Three route files each
  carried a byte-identical private copy of the scope-query helper; they now share
  this one, which is also where `agent` is appended.
- `lib/admin.ts` — `ScopeRef` gains an optional `agent`; `scopeParams` and
  `scopeKey` include it (`scopeKey` must, or a panel keyed on it would show one
  agent's listing while another is selected). New `ALL_AGENTS`, `AgentRef`,
  `listAgents()`.
- `lib/adminSkills.ts` — its own `scopeParams`/form builders thread `agent` too.
- `app/api/admin/agents/route.ts` — new.
- `app/admin/agent-target-select.tsx` — the shared control (one component from the
  start; the Model tab was the last holdout with a plain local `<select>`), with the
  `purpose` prop for the two hint texts.
- `app/admin/tabs.ts` (+ `tabs.test.ts`) — `TAB_KEYS`, `Tab`, `DEFAULT_TAB`,
  `AGENT_TABS`, `parseTab`. Extracted so the parse is testable without mounting the
  admin tree.
- `app/admin/admin-screen.tsx` — owns `agents` + `agentTarget`, derives `tab` from
  the URL through a single `setTab` helper, renders the picker for every
  `AGENT_TABS` entry, and passes `{...selected, agent}` (or `target`) down.
- `app/admin/model-registry-panel.tsx` — takes `target` instead of owning agent
  state; aggregated listing with owner tagging, agent-aware delete, `Register into`
  select, per-user model filtering.
- `app/admin/page.tsx` — `<Suspense>` wrapper.
- The three content panels change only in their effect dependencies
  (`scope.agent`).

## Verification

- `npx tsc --noEmit` clean; `npx next build` passes (37 pages); `npx vitest run`
  59 passed.
- `lib/admin.test.ts` — `scopeKey` keeps its agent-less form byte-identical and
  yields three distinct keys for all/alpha/beta at one scope.
- `app/admin/tabs.test.ts` — every real key round-trips; `null`/`undefined`/`""`/
  `"garbage"`/`"Files"`/`"files "`/`"__proto__"` all fall back to the default;
  `AGENT_TABS` excludes members/branding and names only tabs that exist.
- **Not exercised by automated tests:**
  - the live BFF→proxy round trip for each route (needs a running gateway). The
    parameter plumbing is uniform and the proxy side is unit-tested; verify one
    write per content type manually.
  - the Model tab's aggregated behaviour (R8) and the URL/tab interaction (R9) in a
    browser — both are component behaviour behind a session and a live gateway.
    Worth a manual pass: switch tabs and confirm the URL follows and Back exits;
    with All agents selected, confirm the badges, that Register asks for an agent,
    and that a user row only offers its own agent's models.

## Status: implemented
