# backoffice-admin-shell — Specification

**Status:** Implemented
**Size:** Large (shell restructure: navigation, a two-step selection gate, one mode
merged into another, two pure resolution modules reworked, URL state extended)
**Repo:** `crab-exoskeleton-webapp` only.
**Context:** `context.md` (DEC-1 … DEC-7) — read it first; several requirements below
are the decisions it records, not new judgements.

---

## Problem

`/admin` is laid out like an app screen and behaves like one: two rows of horizontal
navigation at the top (a mode bar, then a section tab strip), a resizable tree rail
beside the panels, and a container capped at `max-w-5xl`. Admins operating it every
day read it as a page they visit, not as a console they work in.

Underneath the layout are two defects that the layout hides, and that are what admins
actually reported:

**The screen chooses the tenant, silently.** `admin-screen.tsx` auto-selects
`scopes[0]` as soon as `listScopes()` resolves. The admin never made that choice and
is never told it was made; the only evidence is a tonal highlight on one node of a
tree that also scrolls. Everything written in that session lands wherever that default
pointed.

**The screen asks for the agent twice, and hides the answer that counts.** `Agents`
asks for an agent at a prominent gate. `Members` asks for none — and then
`invite-member.tsx:75` re-asks for one in a `<select>` inside the form. A mycelium
guest role's name IS the agent key (`lib/invitations.ts`), so that buried control is
what decides which agent a person is granted access to, while the navigation around it
says nothing about any agent at all.

Both failure modes produce the same report: people registered under the wrong
tenant/subscription, and under the wrong agent.

## Goals

- [ ] Primary navigation is a persistent left rail; no horizontal mode bar and no
      horizontal section strip remain.
- [ ] `Agents` and `Members` are one menu, entered through one selection of
      `(agent, scope)` — with zero silent defaults anywhere in the path.
- [ ] The selected `(agent, scope)` is visible without scrolling, on every breakpoint,
      in every section.
- [ ] Every write names its target: the invitation form no longer carries an agent
      control of its own, and submitting an invitation confirms tenant › subscription ›
      agent › level in words.
- [ ] How changes are delivered (the restart policy) is permanent chrome of the
      merged menu, visible in every section instead of collapsed inside each one.
- [ ] The whole screen is operable on a phone and by keyboard.

## Out of Scope

| Item | Reason |
| --- | --- |
| Panel internals (files, secrets, skills, identity, models, bulk config) | This is a shell/navigation/selection refactor. The panels keep their behaviour; they only lose the tree rail beside them and gain the context bar above them. |
| The members panel's roster/file/instance internals | Untouched except the blocked-tenant state (FR-5.4) and the invite form's agent control (FR-6). The FR-7 privacy invariant — no path to a private file's bytes — is unchanged and must stay unchanged. |
| The proxy's and mycelium's APIs | Nothing server-side changes. Every route this screen calls keeps its current contract. |
| The all-agents legacy store's semantics | `ALL_AGENTS` stays the key of a read-only-except-delete legacy entry, exactly as `agent-first-admin` R4 defines it. |
| Keyboard/touch drag-resize | The resizable rail is deleted rather than ported (DEC-7), which retires the `onMouseDown`-only handle instead of fixing it. The nav rail collapses with an ordinary button. |
| A general accessibility audit of `/admin` | FR-8 covers the surfaces this feature builds or moves. Panels not otherwise touched are not audited here. |
| Reusing `components/ui/panel-empty.tsx` across every admin panel | Noted as available (STATE.md deferred idea) and used for the states this feature creates; retrofitting the untouched panels is separate work. |

---

## User Stories

### P1: The console has one navigation, on the left ⭐ MVP

**User Story**: As an admin, I want the main menus in a persistent left rail so the
screen reads and behaves like the backoffice tool I work in all day.

**Why P1**: It is the explicit ask, and the rail is where the merged menu and its
sections have to live before anything else can move.

**Acceptance Criteria**:

1. WHEN the admin screen renders for a caller with any administrative authority THEN
   the system SHALL draw a vertical navigation rail on the left edge of the shell and
   SHALL NOT draw the horizontal mode bar or the horizontal section tab strip.
2. WHEN the caller lacks the authority for a rail item THEN the system SHALL omit that
   item rather than disable it.
3. WHEN the caller has exactly one rail item THEN the system SHALL still draw the rail.
4. WHEN the viewport is below the `md` breakpoint THEN the system SHALL present the
   rail as an off-canvas drawer behind a hamburger control in a top app bar.

**Independent Test**: Load `/admin` as a tenant manager and as a branding-only caller;
the rail is present in both, with different items and no top mode bar.

---

### P2: One menu, entered by choosing an agent and then a scope ⭐ MVP

**User Story**: As an admin, I want `Agents` and `Members` to be one place that I enter
by deliberately picking an agent and then a tenant/subscription, so I always know what
I am about to change.

**Why P1**: This is the correctness job. Removing the silent `scopes[0]` default is the
single change that stops work landing under an unintended tenant.

**Acceptance Criteria**:

1. WHEN the scope list resolves THEN the system SHALL NOT select a scope, regardless of
   how many scopes it contains.
2. WHEN no agent is selected THEN the system SHALL show the agent step and nothing else
   — no scope picker, no sections, no panels.
3. WHEN an agent is selected and no scope is THEN the system SHALL show the scope step
   and nothing else.
4. WHEN both are selected THEN the system SHALL show the section list in the rail and
   the selected section's panel in the content area.
5. WHEN the admin picks a scope THEN the system SHALL require one deliberate action on
   a labelled entry naming both the tenant and, for a subscription, the subscription.

**Independent Test**: Load `/admin` with no query string; no panel is reachable until
two explicit choices are made, and the first screen after reload is the agent step.

---

### P3: The selected target is on screen at all times ⭐ MVP

**User Story**: As an admin, I want the agent and the tenant/subscription I am working
in to be impossible to miss, so I stop discovering after the fact that I was in the
wrong one.

**Why P1**: A conscious selection that is not continuously visible degrades back into
the current state within one scroll.

**Acceptance Criteria**:

1. WHEN a section is on screen THEN the system SHALL display a context bar naming the
   selected agent and the selected tenant (and subscription, when the scope is one),
   without requiring a scroll, on every breakpoint.
2. WHEN the admin changes the agent or the scope THEN the system SHALL announce the new
   context to assistive technology.
3. WHEN the context bar is shown THEN it SHALL carry a separate, explicitly labelled
   control for changing the agent and for changing the scope.

**Independent Test**: Scroll any section to its bottom on a phone-width viewport; the
agent and scope are still readable.

---

### P4: Members is a section of the chosen workspace ⭐ MVP

**User Story**: As an admin, I want member management inside the same selection I use
for everything else, so inviting someone uses the agent and subscription I already
chose.

**Why P1**: The invitation's agent is the value the reported failures got wrong.

**Acceptance Criteria**:

1. WHEN a workspace is selected THEN `Members` SHALL appear in that workspace's section
   list.
2. WHEN the invite form is submitted THEN the system SHALL grant the role for the agent
   named in the context bar, and the form SHALL offer no agent control of its own.
3. WHEN the admin submits an invitation THEN the system SHALL first present a
   confirmation naming the tenant, the subscription, the agent and the access level.
4. WHEN the selected scope is a tenant THEN `Members` SHALL still appear and SHALL
   state that a subscription must be selected (DEC-3).

**Independent Test**: Invite an address; the confirmation names all four values and the
resulting roster badge carries the agent from the context bar.

---

### P5: Layout state survives a reload

**User Story**: As an admin, I want my selection and my rail preference to survive a
reload and a shared link.

**Why P2**: It makes the conscious selection sustainable rather than a tax; it is not
required for the correctness fix.

**Acceptance Criteria**:

1. WHEN the admin selects a scope THEN the system SHALL record it in `?scope=`.
2. WHEN a URL carries `?agent=` and `?scope=` that both resolve THEN the system SHALL
   render that workspace's section directly.
3. WHEN the admin collapses the rail on a desktop viewport THEN the system SHALL
   restore that preference on the next visit.

**Independent Test**: Copy the URL from a section, open it in a new tab, land on the
same workspace and section.

---

## Requirements

### FR-1 — The shell

- **FR-1.1** The screen is a two-column shell: a fixed-width navigation rail on the
  left and a content column on the right. The rail is full height and does not scroll
  with the content.
- **FR-1.2** The rail contains, top to bottom: a brand header with the collapse
  control, the navigation body (FR-2), and a footer carrying "back to chat" and the
  language switcher. `/admin` is its own route and renders no chat sidebar, so the
  footer is the only home for those two controls.
- **FR-1.3** The shell spans the viewport width. The `max-w-5xl` cap on the whole page
  is removed; a readable max width applies to the CONTENT column only, so the rail is
  not pushed into the middle of a wide screen.
- **FR-1.4** The old level-1 mode bar and the level-2 horizontal tab strip are deleted.
  Both roles are served by the rail.
- **FR-1.5** The resizable scope rail beside the panels is deleted with them, together
  with `startResize`, its width state and its `role="separator"` handle (DEC-7).
  `ScopeTree` itself survives and is reused by FR-3.2 and FR-4.4.

### FR-2 — Rail contents and authority

- **FR-2.1** The rail's top-level items are `Workspaces` (the merged menu, DEC-5) and
  `Branding`, in that order, in two visually separated groups: what is administered
  per workspace, and what belongs to the instance as a whole.
- **FR-2.2** An item is offered only when the caller can use it: `Workspaces` needs at
  least one manageable scope, `Branding` needs branding rights. Unavailable items are
  ABSENT, never disabled — a control that exists only to refuse is worse than one that
  is not there.
- **FR-2.3** Unlike the mode bar it replaces, the rail is drawn even with a single
  available item: it is the shell, and it carries the brand header and footer
  regardless.
- **FR-2.4** WHEN the caller has neither scopes nor branding rights THEN the screen
  keeps its current "no admin access" state and draws no rail body.
- **FR-2.5** `Workspaces` is an expandable group. While the selection is incomplete it
  shows the two steps as an ordered progress indicator (step 1 agent, step 2 scope)
  with the resolved value shown against a completed step. Once complete it shows the
  section list for the selected agent.
- **FR-2.6** The active section carries `aria-current="page"`. The active state is
  signalled by more than colour (a fill plus weight), so it survives a monochrome or
  high-contrast rendering.
- **FR-2.7** Branding is reachable without a selection. Entering it does not clear
  `?agent=` or `?scope=`; leaving it returns to the section the admin was last in, the
  way `lastSectionTab` already works.

### FR-3 — The selection gate

- **FR-3.1** **No default scope.** `listScopes()` no longer selects `scopes[0]`, and
  `selected === null` is a first-class state that every panel is gated behind. This
  holds even when the caller has exactly one scope: the admin must see the target
  named at least once before writing to it.
- **FR-3.2** Step 1 is the existing `AgentGate`, unchanged in role: a list of agents
  plus the subordinate legacy entry (`agent-first-admin` R4.2). Step 2 is a scope step
  built on `ScopeTree`, where each selectable entry is a labelled row naming the tenant
  and, for a subscription, the subscription.
- **FR-3.3** Each step names what has already been chosen, so step 2 states which agent
  the scope is being chosen for.
- **FR-3.4** The steps render only once BOTH `listScopes()` and `listAgents()` have
  resolved (`agent-first-admin` R2.5, preserved: `?agent=`/`?scope=` resolve against
  those lists, and drawing earlier would show a gate to a caller whose URL already
  answers it).
- **FR-3.5** `agents === null` means "not fetched"; a failed fetch resolves to `[]`,
  never staying null (`agent-first-admin` R2.6, preserved — the screen holds a spinner
  on null). The same rule applies to the scope list.
- **FR-3.6** Changing the agent from the context bar returns to step 1 and CLEARS the
  scope. A scope is only meaningful as "this agent, here", and silently carrying it
  across an agent change is the class of implicit state this feature exists to remove.
- **FR-3.7** Changing the scope from the context bar returns to step 2 and keeps the
  agent.
- **FR-3.8** `?tab=` SURVIVES an agent change. If the new agent does not offer that
  section, `resolveAgentTab` already lands on its first one (FR-5.6). This is the
  intended interaction — an admin moving between two picoclaw agents stays in the
  section they were working in — so no second clearing rule is added for it.

### FR-4 — The context bar

- **FR-4.1** A context bar sits at the top of the content column, above the section,
  and stays visible while the section scrolls (sticky). It renders on every breakpoint,
  including when the rail is a closed drawer — which is the point: the rail can be shut
  on a phone, the target cannot become invisible.
- **FR-4.2** It names, with an icon each: the selected agent (or the legacy entry's
  label), and the scope as `tenant` or `tenant › subscription`, with a badge stating
  which kind it is. Names that have not resolved fall back to the id — an id reads worse
  than a name and far better than "undefined".
- **FR-4.3** It carries two separate controls, each explicitly labelled: change agent,
  change scope. They are not one "change context" button: the two halves fail
  independently and are corrected independently.
- **FR-4.4** The scope control MAY switch scope in place (a `ScopeTree` popover) rather
  than returning to the full step, provided the switch remains a deliberate,
  clearly-labelled action. The agent control always returns to step 1 (FR-3.6).
- **FR-4.5** It carries the existing "what a write here reaches" sentence, adapted per
  section and preserved verbatim in meaning:
  - default: reaches `<scope>` (and every subscription under it, for a tenant) through
    `<agent>`;
  - `model`: the inventory is proxy-wide; the scope governs only the defaults and pins
    under it;
  - `members` (new): the roster belongs to `<subscription>` whatever agents it runs;
    the agent applies to invitations, instance configuration and instance restarts.
  - legacy entry: the read-only note.
- **FR-4.6** A context change is announced to assistive technology via a polite live
  region. It is not an alert: it is confirmation of something the admin just did.
- **FR-4.7** The sticky region has a HEIGHT CEILING and scrolls inside itself past it.
  Without one, FR-10.6's forced-open delivery form collides with FR-4.1 on a phone: an
  incomplete schedule expands a sticky element holding the policy form and the restart
  notice until it covers the section it exists to label — and it cannot be collapsed,
  because the thing forcing it open is the error being corrected.

### FR-5 — Sections of a workspace

- **FR-5.1** The sections are `files`, `secrets`, `skills`, `persona`, `model`,
  `config` and `members`. `members` joins the section set; `branding` leaves the mode
  concept and becomes a rail item (FR-2.1).
- **FR-5.2** Which sections a given agent offers keeps the rules in `agent-scope.ts`:
  `persona`, `model` and `config` are picoclaw-only; the legacy entry gets the content
  sections alone.
- **FR-5.3** The legacy entry offers NO `members` section. It is not an agent, and
  there is no guest role named for it — an invitation through it could not be
  constructed.
- **FR-5.4** `members` is offered whenever a real agent is selected, INCLUDING with a
  tenant scope, where the panel renders a blocked state saying a subscription must be
  selected and offering the way to select one (DEC-3). This is the single deliberate
  exception to the "a section a target cannot use is absent" convention, taken for
  discoverability; do not "fix" it into an absence.
- **FR-5.5** The restart policy is NO LONGER rendered inside a section. It moves out of
  the section bodies and becomes permanent chrome of the merged menu — see FR-10.
- **FR-5.6** A URL naming a section the selected agent does not offer resolves to that
  agent's first offered section, the way `parseTab` resolves garbage
  (`resolveAgentTab`, preserved).

### FR-6 — Invitations name their target

- **FR-6.1** The agent `<select>` is removed from `invite-member.tsx`. The role is
  resolved from the agent in the context bar plus the chosen access level, using the
  existing `resolveRoleId(roles, agent, level)` path (DEC-2).
- **FR-6.2** The level control stays: read vs. write is a per-invitation choice and is
  not carried by the context.
- **FR-6.3** WHEN the gateway declares no role for the context's agent THEN the form
  says so, naming that agent, and offers no submit — the existing `noRole` copy, now
  reached through the context rather than a local pick.
- **FR-6.4** Submitting opens a confirmation naming tenant, subscription, agent and
  level in full, and the invitation is sent only on confirmation. Revoking already
  confirms; inviting — the action reported as going wrong — did not.
- **FR-6.5** The per-member instance rows keep addressing `InstanceRef`
  (`{tenantId, subsAccId, userAccId, agent}`). The context's agent is the default
  instance acted on; a member holding workspaces under other agents still shows them, so
  an admin can repair a config outside the current context, and each row states its own
  agent.
- **FR-6.5.1** A row whose agent DIFFERS from the context's is visually marked as
  out-of-context, and the editor opened from it names that agent. Listing other agents'
  instances re-introduces a second agent on the Members surface — the exact shape DEC-2
  removed from the invite form — so it may never be mistaken for the current context.
- **FR-6.6** The roster itself is NOT filtered by the agent. It is subscription-scoped,
  and the context bar says so (FR-4.5). `agent-first-admin` R1.3's reasoning is
  preserved: what merged is the selection flow, not the scoping rules.

### FR-7 — URL and persisted state

- **FR-7.1** `?scope=` carries the selected scope, encoded as the existing key shape
  without the agent segment: `t:<tenantId>` for a tenant, `s:<tenantId>:<subsAccId>`
  for a subscription. It is written with `replace` and `scroll: false`, like `?tab=`
  and `?agent=`.
- **FR-7.2** A `?scope=` that resolves against no manageable scope yields NO selection —
  step 2 — rather than an empty working view. Same rule and same reason as
  `resolveAgent`: the query string is user-editable, and a scope can be revoked between
  visits.
- **FR-7.3** `?agent=`, `?scope=` and `?tab=` are the single source of truth for the
  selection and are not mirrored into component state.
- **FR-7.4** The rail's collapsed/expanded preference is persisted client-side (the
  same storage idiom the chat panes already use). It is a layout preference, not
  addressable state, so it does not go in the URL.
- **FR-7.5** Parsing and resolution stay PURE and unit-tested: scope encode/decode and
  the mode/section derivations live in `tabs.ts` / `agent-scope.ts` (or a sibling module
  of the same shape), with a truth table over them. No resolution rule is inlined in the
  screen component.

### FR-8 — Responsive and accessible

- **FR-8.1** Below `md` the rail is an off-canvas drawer with a backdrop, opened from a
  hamburger in a top app bar — the idiom `chat-shell.tsx` already uses, so the two
  screens behave the same way on a phone.
- **FR-8.2** The drawer closes when a navigation choice is made, on backdrop click, and
  on `Escape`. Focus moves into the drawer when it opens and returns to the hamburger
  when it closes.
- **FR-8.3** Between `md` and `lg` the rail defaults to its collapsed (icon) form;
  at `lg` and above it defaults to expanded. In collapsed form every item keeps an
  accessible name.
- **FR-8.3.1** The collapsed form still carries the SECTIONS, as icon rows. The
  horizontal tab strip is gone (FR-1.4), so the rail is the only section navigation
  there is; a collapsed rail that showed only the two top-level items would leave every
  section unreachable — at the breakpoint where collapsed is the DEFAULT. What the
  collapsed form drops is the indentation and the text, not the rows.
- **FR-8.4** Interactive targets in the rail, the gate and the context bar are at least
  44×44 CSS px on touch viewports.
- **FR-8.5** The rail is a `<nav>` with an accessible name; the gate steps are an
  ordered structure whose headings state the step; the context bar is a labelled region.
- **FR-8.6** Long tenant, subscription and agent names truncate with the full value
  available on hover/focus, and never force horizontal page scroll. The context bar
  wraps to two lines before it truncates.
- **FR-8.7** Drawer and rail transitions honour `prefers-reduced-motion`. Per
  `agent-first-admin` R2.4, the gate itself does not slide — this is a page-wide area,
  not a narrow column where the movement carries meaning.

### FR-9 — Copy

- **FR-9.1** Every new or changed string goes through `adminCopy` / `useT` in
  `lib/i18n/admin.ts`, in `en` and `pt`, with `parity.test.ts` as the gate. No literal
  user-visible text in components.
- **FR-9.2** Tab keys, agent keys, model and provider identifiers and secret formats
  stay untranslated — they are identifiers and land in config files verbatim.
- **FR-9.3** Copy removed with the mode bar (`shell.areaAria`, `shell.agents` as a mode
  label, and the invite form's agent-select label) is deleted, not orphaned, in both
  locales.


### FR-10 — Restart delivery is chrome of the menu, not of a section

The restart policy answers "when do the containers pick this up", and it applies to
every write made in this sitting under the selected `(agent, scope)`. Today it is an
accordion repeated inside each section, collapsed by default and absent from `files` —
so a policy in force is something the admin has to remember rather than something the
screen states.

- **FR-10.1** The restart-policy control is rendered ONCE, by the shell, as part of the
  merged menu's persistent chrome. No section renders it, and no section hides it.
- **FR-10.2** It is visible whenever a workspace is selected, in every section,
  WITHOUT opening an accordion: the policy in force is readable at a glance, and
  changing it takes one interaction.
- **FR-10.3** It is chrome of the `Workspaces` menu only. It does not appear on
  `Branding` — an instance-wide brand write has no scope to bounce.
- **FR-10.4** It has exactly ONE mount point, on every breakpoint: the sticky context
  bar (FR-4), which is already the one surface that stays visible whatever the rail is
  doing. It is not mounted in the rail.

  The alternative — rail on desktop, context bar on mobile — was written and rejected.
  The two containers have different layout contracts (the rail does not scroll with the
  content, the context bar sticks to it), and the rail collapses to an icon-only form
  (FR-8.3) that cannot show "scheduled 2026-07-27 18:00" at a glance, which is exactly
  what FR-10.2 requires. Two mount points would also be two places to keep in agreement
  for one piece of state.

  "No menu que estamos criando agora" is satisfied by this: the context bar is chrome of
  the merged `Workspaces` menu, and the requirement's contrast was with `Branding`
  (FR-10.3), not with the rail column.
- **FR-10.4.1** The rail MAY carry an affordance that moves focus to the control; the
  control itself is never rendered twice.
- **FR-10.5** WHEN the current section makes no change that needs delivery (`files`
  reaches containers through a live read-only mount) THEN the control STAYS rendered and
  states that this section needs no restart. It does not disappear: a control that comes
  and goes as the admin moves between sections is the behaviour this requirement exists
  to remove.
- **FR-10.6** The existing validity gate is unchanged in effect: an incomplete schedule
  cannot be honoured, so a section that writes stays blocked with the same error until
  the policy is complete. It is now checked in one place that is always on screen, so the
  admin can see and fix the cause without hunting for a collapsed section.
- **FR-10.6.1** `files` is NOT blocked by an invalid policy. Today the whole accordion —
  and with it the `!policyIsValid` block — lives inside a `sectionTab !== "files"`
  branch, so the question never arises. Once the control is always mounted, blocking has
  to be gated on "this section needs delivery" rather than on the control being present;
  otherwise a half-typed schedule locks a section that never needed the policy at all.
- **FR-10.7** The restart NOTICE (the confirmation of what a bounce will hit) keeps its
  current target derivation: the scope from the context plus the agent, with the legacy
  entry sending no agent — `lib/adminRestart.ts` strips the sentinel from the wire, and
  the confirmation copy reads the field directly.
- **FR-10.8** `members` is not an exception. Its per-instance restart button stays as a
  separate, per-member action; the menu-level policy governs the writes the other
  sections make.

---

## Edge Cases

- WHEN the caller has branding rights and no scopes THEN the rail shows `Branding`
  alone and the screen lands there, with no agent step behind it.
- WHEN the proxy reports no agents THEN step 1 says so and still offers the legacy
  entry, which reaches whatever was already stored.
- WHEN `listAgents()` fails THEN it resolves to `[]` and behaves as the line above; the
  screen never hangs on a spinner.
- WHEN `?agent=` names an agent that no longer exists THEN the selection is null and
  step 1 opens — never a working view whose header names an absent agent.
- WHEN `?scope=` names a scope the caller no longer manages THEN the selection is null
  and step 2 opens, with the agent preserved.
- WHEN the legacy entry is selected THEN the section list is `files`, `secrets`,
  `skills` only, all read-only except delete, and the context bar shows the read-only
  note in place of the "reaches" sentence.
- WHEN the selected scope is a tenant AND the section is `members` THEN the panel is
  blocked with an explanation and a path to pick a subscription (FR-5.4).
- WHEN the caller manages exactly one subscription THEN step 2 still requires the click
  (FR-3.1).
- WHEN the restart policy is incomplete THEN the section stays blocked exactly as
  today, and the control naming the cause is on screen rather than inside a collapsed
  accordion; the context bar and the rail remain operable, so the admin can leave.
- WHEN the section is `files` THEN the restart control is still rendered and says this
  section needs no restart (FR-10.5), and an invalid policy does NOT block it
  (FR-10.6.1).
- WHEN `Branding` is the active rail item THEN no restart control is rendered (FR-10.3).
- WHEN the viewport is a phone AND the drawer is open THEN the context bar is still
  reachable behind it, and closing the drawer reveals it without a scroll.

---

## Requirement Traceability

| ID | Source | Note |
| --- | --- | --- |
| FR-1.1 – FR-1.4 | User ask ("menus principais do lado esquerdo, não acima") | |
| FR-1.5 | DEC-7 | Retires an `onMouseDown`-only handle rather than porting it |
| FR-2.1 – FR-2.3 | DEC-4, DEC-5 | Branding outside the flow; merged menu named Workspaces |
| FR-2.4 | `agent-first-admin` R1.5 | "No admin access" state preserved |
| FR-2.5 | User ask ("primeira coisa … selecionar o agente e depois … tenant/subscription") | |
| FR-3.1 | Root cause found in `admin-screen.tsx` (`scopes[0]` auto-select) | The correctness fix |
| FR-3.2 – FR-3.3 | User ask ("selecionar precisa ser algo bem consciente") | |
| FR-3.4 – FR-3.5 | `agent-first-admin` R2.5, R2.6 | Preserved verbatim |
| FR-3.6 – FR-3.7 | Derived from FR-3.1 | No implicit state across an agent change |
| FR-4.1 – FR-4.6 | User ask ("precisa estar bem visível") | |
| FR-5.1 – FR-5.2 | User ask (merge) + `agent-scope.ts` rules | |
| FR-5.3 | `agent-first-admin` R4 | No guest role exists for the legacy key |
| FR-5.4 | DEC-3 | User's call, against the house convention; reason recorded |
| FR-5.5 – FR-5.6 | Current behaviour | Preserved |
| FR-6.1 – FR-6.4 | DEC-2 + `lib/invitations.ts` (role name = agent key) | The reported failure |
| FR-6.5 – FR-6.6 | `lib/admin.ts:247` (`InstanceRef` carries `agent`) + `agent-first-admin` R1.3 | Roster subscription-scoped, instance agent-scoped |
| FR-7.1 – FR-7.3 | DEC-1 | Revokes `agent-first-admin` R5.3 |
| FR-7.4 | Chat panes' existing persisted-layout idiom | |
| FR-7.5 | Repo convention (`tabs.ts`, `agent-scope.ts` truth tables) | |
| FR-4.7 | Found in review of the built shell | FR-10.6 vs. FR-4.1 on a phone |
| FR-8.1 – FR-8.7 | User ask ("responsivo e acessível em mobile") + `chat-shell.tsx` idiom | |
| FR-8.3.1 | Found in review of the built shell | Collapsed is the default below `lg` |
| FR-9.1 – FR-9.3 | `i18n-all-screens`, `parity.test.ts` | |
| FR-10.1 – FR-10.8 | User ask ("o menu de restart precisa estar sempre visível … no menu que estamos criando") | Moves the policy out of the section accordions |

---

## Verification

Gate for every task (STATE.md):

- `npx tsc --noEmit` — baseline is **4 pre-existing errors in untouched test files**;
  the gate is "still 5", not zero.
- `npx vitest run` — green, including the reworked `tabs.test.ts` and
  `agent-scope.test.ts` truth tables and `lib/i18n/parity.test.ts`.
- `yarn build` DOES work and was run (48.9s, clean). The `EACCES` on a root-owned
  `.next/` recorded in STATE.md did not reproduce — there was no `.next/` and the cwd is
  writable. It is the only gate that compiles the client tree the way Next will, so use
  it. `yarn lint` remains deprecated and unconfigured, and gates nothing.

Manual walk (no browser tooling has been available in recent sessions — if it is
absent again, this list is what a follow-up task owes):

1. Fresh `/admin`, no query string → agent step, nothing else.
2. Pick agent → scope step naming that agent → pick subscription → sections.
3. Reload → same workspace, same section.
4. Change agent from the context bar → step 1, scope cleared.
5. Invite → confirmation names tenant, subscription, agent, level.
6. Tenant scope + `members` → blocked state with a way to pick a subscription.
7. Restart policy readable without opening anything, in every section including
   `files`; still readable on a phone with the drawer closed.
8. Phone width: hamburger, drawer, backdrop, `Escape`, context bar still visible at the
   bottom of a long section.
9. Keyboard only: rail → gate → context controls → section, with a visible focus ring
   throughout.
