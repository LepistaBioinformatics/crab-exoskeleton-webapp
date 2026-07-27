# restart-control (webapp side) — Specification

**The authoritative spec, design and full task list live in the sibling repo:**
`crab-shell-proxy/.specs/features/restart-control/{spec,context,design,tasks}.md`.

This file records only what the webapp owns, so a reader working in this repo
does not have to reconstruct it. Requirement IDs are the proxy spec's — do not
renumber them here.

---

## What the webapp is responsible for

### FR-7 — Member surface

- **FR-7.1** The chat screen polls `GET /api/restart` and renders a banner when
  `pending`.
- **FR-7.2** With `scheduledAt`: informational banner — "your assistant will
  restart at &lt;local time&gt;". No button.
- **FR-7.3** Without `scheduledAt`: actionable banner with **Restart now**, and
  the reason phrased from the enum (`shared-secret`, `shared-skills`,
  `shared-files`, `model`, `own-secret`, `admin-request`).
- **FR-7.4** Button disabled while in flight. No server-side cooldown exists —
  the proxy's per-container lock already serializes (DEC-4).
- **FR-7.5** Re-fetch status after a successful restart; the banner disappears.
- **FR-7.6** A read-only member sees the banner without the button (the proxy's
  `POST /v1/restart` is write-gated at the gateway, so the button would 403).
- **FR-7.7** After a successful secret write the drawer surfaces the restart
  affordance inline — the proxy no longer force-restarts on a member's own
  secret write (DEC-3).

### FR-8 — Admin surface

- **FR-8.1** Panels whose action needs a bounce (shared secrets, shared skills,
  model) offer **Restart now** / **Notify members** / **Schedule for…**.
- **FR-8.2** The choice persists across actions within a session, client-side
  only.
- **FR-8.3** A scope with a pending notice shows it, with a withdraw action.

#### FR-8.3 — how the webapp implements it (added after the first pass shipped without it)

The first pass built FR-8.1/8.2 and stopped. `GET`, `POST` and `DELETE` on
`/api/admin/restart` were routed end to end and left with no caller, so an admin
could arm a notice or a schedule from a save and then had no way to see it, amend
it, or withdraw it — and no way to bounce a scope without inventing a change to
save. This section records what closes that, inside the FR IDs the proxy spec
already owns.

- The affordance lives in the same **Advanced — when changes take effect**
  section as the policy selector (FR-8.1). One place owns delivery: the
  radiogroup says *when*, the block below it says *what is pending now* and
  offers the verb.
- **Read** (FR-5.2): on entering a scoped tab that can bounce, and after every
  action, fetch the notice for the scope in the rail plus the agent in the tab
  picker. `all` is not an agent — the key is omitted so the proxy reads the
  scope-wide record.
- **Act** (FR-5.1): one button, whose verb follows the mode already chosen in
  the radiogroup — *Restart now* / *Notify members* / *Schedule the restart*.
  Reusing the mode is what keeps the section from carrying two competing notions
  of delivery. `reason` is omitted, so the proxy records `admin-request`.
- **Withdraw** (FR-5.3): offered only when a notice exists.
- An immediate bounce interrupts everyone in the scope mid-conversation and
  cannot be undone, so it is confirmed first. Notify and schedule are not: both
  are reversible by the withdraw action beside them.
- The scope is never widened silently: the confirmation names the tenant or
  subscription, and the agent when one is selected.

**Known limit, decided rather than inherited.** The read is one slot, not the
cascade. `Store.Get` looks up `rec.Agents[agentOrAll(agentKey)]` for exactly the
tenant/subscription/agent asked for — only the member path (`Store.Resolve`)
walks the four cascade positions and takes the newest. So a notice armed on the
Models tab (always a concrete agent) is invisible from Secrets with **All
agents** selected, and a tenant-wide notice is invisible from a subscription.
Showing the cascade instead would be worse: `DELETE` withdraws the exact slot, so
a Withdraw button under a notice belonging to a wider scope would appear to do
nothing. The mitigation is that the "nothing armed" line **names the slot it
read** — scope and agent — so an empty result never reads as "nothing anywhere".
Reading the cascade honestly needs a proxy change (a read that reports which
position each notice came from), which is not client-only work.

**Not in scope.** Restarting one member's workspace. `Manager.RestartWorkspace`
takes a full `WorkspaceKey` and could serve it, but there is no admin-authorized
route for it: `POST /v1/restart` builds the key from the caller's own profile and
has a test named for that invariant (FR-1.1). Adding one is proxy work, and the
notice model is per scope, so it would be a bounce with no notice attached.

### Contract with the proxy

```
GET  /api/restart        -> {pending, reason, note, noticeAt, scheduledAt, lastRestartAt, running}
POST /api/restart        -> {status: "restarted"|"noop", lastRestartAt}

GET    /api/admin/restart?tenantId=&subsAccId=&agent=
POST   /api/admin/restart   {tenantId, subsAccId?, agent?, mode, at?, reason?, note?}
DELETE /api/admin/restart?...
```

Admin mutation calls gain the policy as query parameters:
`?restart=now|notice|schedule&restart_at=<RFC3339>&restart_note=<text>`.
Omitting `restart` preserves today's immediate-bounce behaviour.

### Constraints

- BFF invariant: the browser never talks to mycelium or the proxy directly; the
  session JWT stays server-side (`lib/mycelium.ts`, `lib/adminProxy.ts`).
- ~~Dropped: `lib/i18n` covers the landing page only…~~ Reinstated. The i18n
  sweep since then put the chat and admin screens under `lib/i18n`, so all new
  copy goes through `lib/i18n/admin.ts` in **both** locales — `parity.test.ts`
  fails on a `pt` leaf left identical to its `en` twin.
- Times arrive as RFC3339 UTC and are formatted to the viewer's locale in the
  browser. No relative arithmetic against a server clock.

### Gateway constraint

The proxy's `/v1/restart` is declared as ONE `[[agent.path]]` block covering GET
and POST, gated on the role name. The gateway matches routes by path alone and
errors on multiple matches, so GET and POST cannot carry different permissions
there; POST's write requirement is enforced in-proxy instead. Nothing for the
webapp to do — noted so a 403 on POST for a read-only member reads as intended
behaviour, not a bug.

### Tasks

T-13 … T-17 in the proxy repo's `tasks.md`. T-18 (i18n) is dropped, see above.

FR-8.3 was implemented separately, after the rest of FR-8 had shipped:

| Step | Where | Done when |
| --- | --- | --- |
| Typed client for the three routes | `lib/adminRestart.ts` | omits `all` as an agent; normalizes `{notice: null}` to `null` |
| The section's read/act/withdraw block | `app/admin/restart-notice.tsx` | renders pending vs none, verb follows the policy mode, confirms an immediate bounce |
| Wiring | `app/admin/admin-screen.tsx` | inside the Advanced accordion, under the policy selector |
| Copy | `lib/i18n/admin.ts` | `en` + `pt`, parity test green |
| Tests | `lib/adminRestart.test.ts`, `app/admin/restart-notice.test.tsx` | query building and each render state |
