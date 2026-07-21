# Feature: Scope-gated native (picoclaw) secrets

> **STATUS: REVERTED / SUPERSEDED.** This write-only gate broke the model-key
> flow: native secrets are strictly per-user and never cascade from a scope
> (`syncEffectiveSecrets`: "the user's native overlay is never shared"), so
> blocking non-admins removed the *only* path to set/rotate a per-user model
> API key — a normal user was stranded with an invalid key and a 401 at model
> call time. The change was reverted to the known-good per-user BYOK behavior.
> The real requirement (admins substitute the value, other users read it) is
> re-scoped as a shared, admin-managed, cascading model key — see
> `../model-list-management/` and the option (C) discussion. Kept for history.

## Summary

Only users who **administer the workspace's scope** may configure the picoclaw
*native* secrets (model API keys and web/browser search provider keys). Normal
users may still configure the other formats (dotenv / json / file).

"Administer the scope" = the caller has, in `GET /api/admin/scopes`, either a
`tenant` scope for the workspace's `tenant_id`, or a `subscription` scope
matching the workspace's `tenant_id` + `subs_acc_id`.

## Context

- The per-user, per-agent secrets drawer (`app/chat/secrets-drawer.tsx`) offers
  four formats (`lib/secrets.ts` `SECRET_FORMATS`): dotenv, json, file, native.
  The `native` format targets picoclaw slots — `web.<provider>` (browser/search)
  and `model_list.<model>.api_keys` (model keys).
- Writes go through the BFF `app/api/secrets/route.ts` (POST create/update,
  DELETE) → `/picoclaw-<role>/v1/secrets`. The picoclaw proxy does **not**
  enforce scope-management authority for native secrets, so the BFF is the gate
  (same posture as white-label branding: "writes are server-side gated
  regardless").
- Scope authority model (`lib/admin.ts`): `AdminScope { kind: 'tenant' |
  'subscription', tenantId, subsAccId? }` from `/api/admin/scopes`. A normal
  user gets an empty list.
- The scope-level admin path `/api/admin/shared-secrets` is already gateway-
  gated via `adminProxy` — out of scope here.

## Requirements

- **R1** — Server: in `app/api/secrets/route.ts`, POST and DELETE with
  `format === "native"` must be rejected with 403 unless the caller manages the
  workspace scope. Non-native formats are unaffected.
- **R2** — Scope check: caller manages the scope iff they hold a `tenant` scope
  for `tenant_id`, or a `subscription` scope for `tenant_id` + `subs_acc_id`.
- **R3** — Scope authority is fetched server-side from the same `/scopes`
  gateway endpoint the admin screen uses; any fetch failure denies (secure
  default).
- **R4** — UI: for users who don't manage the workspace scope, the drawer hides
  the `native` option from the format dropdown **and** hides the existing
  `native` group from the set-secrets list. This is cosmetic; R1 is the gate.
- **R5** — The pure scope-membership check is shared (client + server) and unit
  tested.

## Design

- `lib/admin.ts` — add pure `canManageWorkspaceScope(scopes, tenantId,
  subsAccId)` (no I/O; usable client + server).
- `lib/adminScopes.ts` (new, server-only) — `fetchCallerScopes(session)`:
  forwards to `/scopes` via `adminProxy.forwardAdmin`, returns `AdminScope[]`,
  `[]` on any error (deny-safe).
- `app/api/secrets/route.ts` — guard POST + DELETE when `format === "native"`.
- `app/chat/secrets-drawer.tsx` — on open, `listScopes()` and compute
  `canManageNative`; filter the dropdown and the listed groups.

## Files

- `lib/admin.ts` (edit) + `lib/admin.test.ts` (new)
- `lib/adminScopes.ts` (new)
- `app/api/secrets/route.ts` (edit)
- `app/chat/secrets-drawer.tsx` (edit)

## Verification notes

- **Id-space (confirmed):** `workspace.s` (from `/v1/subscriptions`) and
  `AdminScope.subsAccId` (from `/v1/admin/scopes`) are the same identifier. In
  crab-shell-proxy, `handleAdminScopes` enumerates subscription scopes via
  `ListTenantSubscriptions` = the dir names under
  `tenants/<tenant_id>/subscriptions/`, which is exactly the `subs_acc_id` the
  per-user secret store and chat paths address. If they diverged the user
  couldn't reach their own secrets — so the subscription-scope branch is sound.
- **Tested:** the pure `canManageWorkspaceScope` helper (6 cases). tsc clean.
- **NOT exercised by automated tests:** the route 403 guard and the
  `fetchCallerScopes` deny-on-error path — reaching them needs a non-admin
  session against a live gateway. Verify manually.
- **Known message quirk:** a native write with a just-expired token surfaces
  `forbidden` (deny-on-error `[]`) instead of `session_expired`, and the scope
  fetch clears the session as a side effect — the misleading message shows once,
  then the next request corrects it. Deny-safe is intentional.

## Non-goals

- No change to `/api/admin/shared-secrets` (already gated).
- No enforcement at the picoclaw/Go layer (BFF is the boundary; the gateway is
  not directly reachable by browsers in this deployment).
