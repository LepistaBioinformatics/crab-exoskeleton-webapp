# Feature: Shared skills management (admin) — backend gap

> **STATUS: BLOCKED on a proxy backend + a design decision.** The webapp side
> shipped ahead of the crab-shell-proxy. The "Shared skills" admin tab is
> **hidden** for now (admin-screen.tsx TABS entry commented) so it stops
> surfacing the raw `404 page not found`. Re-enable the tab once the proxy
> endpoints below exist.

## Symptom

The "Shared skills" admin panel showed `404 page not found` (Go's
`http.NotFound` text) below the "New skill" button. Cause: `listSharedSkills`
→ `GET /api/admin/skills` → BFF `proxyAdminJson(session, "/skills?...")` →
`/picoclaw-<role>/v1/admin/skills` — a route the proxy **does not register**.

## What exists vs what's missing

- **Webapp (present):** `app/admin/shared-skills-panel.tsx`, `lib/adminSkills.ts`,
  and BFF routes `app/api/admin/skills/{route,doc/route,archive/route}.ts`.
  All assume **per-scope** skills with list / create (SKILL.md doc or zip) /
  delete / doc / archive — mirroring the shared-files admin API.
- **Proxy (missing):** no `handleAdminSkill*` handlers; nothing registered under
  `/v1/admin/skills` in `internal/httpapi/handlers.go`. `internal/httpapi` has
  no `skill` symbol at all.
- **Proxy (only skill concept present):** `config.ManagedSkillsDir(root)` =
  `<root>/managed-skills` — a **global, operator-managed, read-only** skills
  root (materialized once per process via `materializeManagedContent`, cascaded
  read-only into each workspace's `skills/` via `sharedSkillBinds`). It is NOT
  per-scope and has NO CRUD path.

## The design decision (blocks implementation)

The webapp assumes **per-scope, writable** shared skills; the proxy only has a
**global, read-only** skills dir. These don't reconcile without a choice:

- **Option A — per-scope shared-skills subsystem (matches the webapp).** Add
  per-scope storage (e.g. `TenantSharedSkillsDir` / `SubscriptionSharedSkillsDir`
  under the tenant tree, like shared files/secrets), cascade it read-only into
  workspaces (extend `sharedSkillBinds`), and implement 5 endpoints
  (`GET/POST/DELETE /v1/admin/skills`, `GET /v1/admin/skills/doc`,
  `GET /v1/admin/skills/archive`) mirroring the shared-files handlers
  (`handleAdminShared*` in `internal/httpapi/admin.go`), authorized via
  `AuthorizeSharedScope`. Largest effort; fits the existing per-scope admin
  model (files/secrets).
- **Option B — expose the global managed-skills as operator-only CRUD.** Point
  the panel at the global `managed-skills` dir (instance-admin gated, no scope),
  and drop the per-scope framing from the webapp. Smaller, but changes the
  webapp UX (no scope picker for skills) and only serves operators.

## Suggested endpoints (Option A)

Mirror shared-files exactly (same scope params, auth, response shapes):
- `GET  /v1/admin/skills?scope&tenant_id&subs_acc_id` → `{ skills: SkillMeta[] }`
- `POST /v1/admin/skills` (multipart: SKILL.md body OR zip) → create/update
- `DELETE /v1/admin/skills?...&name` → delete
- `GET  /v1/admin/skills/doc?...&name` → `{ name, content, meta }`
- `GET  /v1/admin/skills/archive?...&name` → zip bytes stream

## Files

- Proxy: new `internal/httpapi/admin_skills.go` (handlers) + registration in
  `handlers.go` + per-scope storage/cascade in `internal/docker`.
- Webapp: un-hide the TABS entry in `app/admin/admin-screen.tsx`. No other
  webapp change (panel/BFF/lib already exist).
