# backoffice-admin-shell — Context

Decisions taken with the user before the spec was written. Each one closes a gray
area where two readings would have produced materially different screens.

---

## The finding that reframed the request

The ask was "merge the Agents and Members menus, because admins are registering
people under the wrong tenant/subscription and even the wrong agent". Reading the
code first changed what the merge is FOR.

**Inviting a member is already agent-scoped, and the screen hides it.**
`lib/invitations.ts` states it outright: a mycelium guest role's NAME IS THE AGENT
KEY (the gateway declares `protectedByRoles = [{ name = "alpha", … }]` and mycelium
auto-creates the declared roles). So an invitation is the tuple
`(tenant, subscription, agent, level)`.

Today:

- The `Agents` mode asks for an agent at a gate, prominently, before anything else.
- The `Members` mode asks for NO agent at all — and then `invite-member.tsx:75`
  re-asks for one in a `<select>` buried inside the form, unlabelled by anything the
  surrounding navigation says.

Two different agent selections live on one screen, and the one that decides who gets
access to what is the invisible one. That is the mechanism behind "convidou para o
agente errado", and no amount of left-hand navigation fixes it on its own.

**And the tenant is chosen by the screen, not by the admin.** `admin-screen.tsx`
auto-selects `scopes[0]` the moment `listScopes()` resolves. The admin never made
that choice, was never told it was made, and the only evidence of it is a tonal
highlight on one node of a tree. That is the mechanism behind "registrando pessoas
no tenant errado".

So this feature has two jobs, and the layout is the smaller one:

1. **The layout job** — a backoffice shell: navigation on the left, one merged menu.
2. **The correctness job** — every administrative action names the same, single,
   deliberately-chosen `(agent, scope)` target, and no part of the screen picks one
   silently or asks for a second one in private.

---

## Reconciling with `agent-first-admin`

That spec (R1.3/R1.4) deliberately SPLIT Members out of the agent-scoped sections,
reasoning that "a member list belongs to a subscription whatever agents that
subscription runs". That reasoning stays correct and is not being reversed.

What is being merged is the **selection flow**, not the scoping rules. After this
change:

- The **roster** (who is invited, who has a workspace) is still SUBSCRIPTION-scoped
  and is not filtered by the selected agent.
- The **invitation**, the **per-member instance config** and the **per-member
  restart** are still AGENT-scoped — `InstanceRef` (`lib/admin.ts:247`) carries
  `agent`, and `users/config` requires it.
- Both now read that agent from ONE conscious selection instead of from a hidden
  form control.

`agent-first-admin` separated the navigation but left the selection passive. Passive
selection is the actual defect.

---

## DEC-1 — The selected scope lives in the URL

`?scope=` joins `?agent=`, under the same rules: the URL is the single source of
truth, written with `replace` and `scroll: false`.

**This revokes `agent-first-admin` R5.3** ("the scope stays out of the URL"), which
was written when the scope was auto-picked and therefore not worth preserving. A
selection the spec now calls conscious and prominently displayed cannot evaporate on
reload — the admin would come back to a screen that either re-picked for them (the
bug) or shows nothing while their previous work is still on their mind.

Rejected: keeping it ephemeral so every visit re-picks. It is more conscious in the
strictest sense, but it costs a full re-selection on every reload and makes a
direct link to a context impossible — and the admins' complaint is about not KNOWING
the target, not about picking it too rarely.

## DEC-2 — The invite form inherits the agent from the context

The agent `<select>` inside `invite-member.tsx` is REMOVED. The form invites into the
agent already chosen at the gate and named in the context bar. It keeps the access
level (read/write), which is a genuine per-invitation choice and is not carried by
the context.

This is the direct fix for the reported failure. Rejected: keeping the local picker
(leaves the ambiguity in place), and "inherit but allow an explicit override" (a
second way to name an agent is exactly what is being removed; an admin who wants a
different agent changes the context, which is one click and is visible afterwards).

## DEC-3 — Members with a TENANT scope selected: present but blocked

**User's call, against the spec's own house convention.** `agent-scope.ts` establishes
that a section a target cannot use is ABSENT rather than present-and-explaining-itself,
and the recommendation was to follow it.

The user chose the other branch: `Members` stays in the section list with a tenant
scope selected, and the panel says a subscription must be chosen. The reasoning that
wins here is discoverability — an admin who manages tenants and never sees a `Members`
entry cannot learn that member management exists one level down.

Consequence recorded so nobody "fixes" it later: this is the ONE section that renders
a blocked state instead of disappearing, and the spec says why (FR-5.4).

## DEC-4 — Branding is its own rail item, outside the agent→scope flow

Branding is instance-wide: it has no scope and no agent, which is why the current
screen has to special-case it in `resolveMode`. In the rail it sits in its own group
(`Instance`), reachable without passing the gate. The gate belongs to the merged
menu, not to the screen.

## DEC-5 — The merged menu is called "Workspaces"

The triple the admin selects — tenant, subscription, agent — is exactly what
`app/chat/fragment.ts` already calls a `Workspace`, and what the chat sidebar already
asks members to pick. Reusing the word means the admin screen and the chat screen name
the same thing the same way.

A TENANT scope is not a single workspace; it means "every workspace of this agent
under this tenant", which is what the existing copy already says ("reaches X and
every subscription under it, through alpha"). The vocabulary survives that.

Only the WORD is reused. The data layer is not: `use-workspaces` builds from the
member's own grants, while this screen builds from `listScopes()` (what you may
administer) crossed with `listAgents()` (what the proxy runs). Those are different
questions and stay different feeds.

## DEC-6 — The conscious moment is the gate plus a confirmation on invite, not a third click

"Selecting must be deliberate" is served by three things: a two-step gate that
renders nothing until both steps are answered, a context bar that never scrolls away,
and an explicit `Change` control for each half.

A fourth "confirm this context" step was rejected — it would tax every context change,
including the harmless ones (reading a file list), to defend against a mistake that
only matters when something is written.

Instead the confirmation goes where the damage is: **submitting an invitation opens a
confirm dialog naming tenant › subscription › agent › level in full.** Revoking
already has one (`ConfirmDialog` in `members-panel.tsx`); inviting, the action the
user reported going wrong, had none.

## DEC-7 — The resizable scope rail is deleted, not ported

Scope selection moves into the gate and the context bar, so the working view no longer
carries a scope tree beside the panels. `startResize`, the 180–480px clamp and the
`role="separator"` drag handle go with it.

That removes a live accessibility wart for free: the handle was `onMouseDown`-only —
no keyboard, no touch — and porting it into a backoffice rail would have meant either
carrying the defect forward or growing this feature an a11y sub-project. The nav rail
gets a discrete collapse/expand toggle instead, which is keyboard-operable by being an
ordinary button.

`ScopeTree` itself SURVIVES and is reused inside the gate's step 2 and the context
bar's scope switcher — the hierarchy is still how an admin finds a subscription.

## DEC-8 — The restart policy is chrome of the menu, not of a section

Added by the user after the first pass: "o menu de restart precisa estar sempre visível
na tela, não de brand, mas no menu que estamos criando agora".

Today `RestartPolicySelect` + `RestartNoticeBlock` sit in a collapsed `Accordion`
repeated inside every section except `files`. Two consequences: the policy in force is
something the admin has to remember rather than read, and the control appears and
disappears as they move between sections.

It moves to the shell and is rendered ONCE, in the sticky context bar, on every
breakpoint (FR-10.4). A rail-on-desktop / bar-on-mobile split was drafted and rejected:
the two containers have different scroll contracts, the rail collapses to an icon-only
form that cannot state "scheduled 2026-07-27 18:00" at a glance, and one piece of state
with two mount points is two places to keep in agreement. The context bar IS chrome of
the menu being built, and the ask's contrast was with `Branding`, not with the rail.

It stays absent from `Branding` (an instance-wide brand write has no scope to bounce),
and under `files` it is present-and-saying-so rather than absent, since a control that
vanishes per section is the behaviour being removed.

---

## Constraints carried into the spec

- **Repo**: `crab-exoskeleton-webapp` only (a submodule). Spec artifacts under
  `.specs/features/backoffice-admin-shell/`, per its `.claude/CLAUDE.md`. The parent
  `zombie-crab-project` only records a submodule pointer bump.
- **i18n is mandatory**: every string through `adminCopy` / `useT`
  (`lib/i18n/admin.ts`), en + pt, with `parity.test.ts` as the gate.
- **Gate check** is `npx tsc --noEmit` (baseline: **5** pre-existing errors across 4
  untouched test files — the gate is "still 5", not zero) plus `vitest`, plus `yarn
  build`. Two STATE.md facts were stale and were corrected during execution: the
  baseline was recorded as 4, and `yarn build` was recorded as hitting `EACCES` on a
  root-owned `.next/` — it does not, and the build passes. `yarn lint` is still
  deprecated and unconfigured, and gates nothing.
- **Resolution rules stay pure**: `tabs.ts` and `agent-scope.ts` hold the derivation
  functions with truth tables over them, because that is where this screen goes
  quietly wrong and it is the established convention.
- **Panel internals are out of scope** except where a decision above touches them
  (invite form, members panel's blocked state, panels losing the rail beside them).
