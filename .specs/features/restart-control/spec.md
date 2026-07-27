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
- ~~All strings through `lib/i18n`.~~ Dropped: `lib/i18n` covers the landing
  page only, and the chat/admin screens use plain English literals by an
  explicit decision recorded in `lib/i18n/config.ts`. The new copy follows the
  surrounding convention.
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
