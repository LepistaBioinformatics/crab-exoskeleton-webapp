---
description: Mycelium is called over JSON-RPC; the one REST exception and the check that holds it
paths:
  - "app/api/**"
  - "lib/**"
---

# Calling mycelium

**Use `myceliumRpc(method, params, token)` from `lib/mycelium.ts`.** It POSTs
`{jsonrpc, method, params, id}` to `/_adm/rpc` with camelCase params.

REST is not an equivalent transport. The gateway's `beginners` endpoints are
**external-identity-provider only**: for a magic-link user they answer
`400 "Invalid provider"`. The RPC dispatcher resolves the internal issuer, so it is the
only transport this deployment's own users work over — established empirically, in
`.specs/features/onboarding/context.md`. The RPC surface is also broader: guest
invite/uninvite and account get have no REST equivalent this stack can reach.

**Never guess a method name.** The registry is `ports/api/src/rpc/method_names.rs` in
the mycelium checkout, and `rpc.discover` returns an OpenRPC description at runtime. An
invented name fails at runtime and the failure looks like a permissions problem. RPC
names do not track REST vocabulary: REST's `uninvite_guest` is
`subscriptionsManager.guests.revokeUserGuestToSubscriptionAccount`.

**Where this does not apply.** Requests to **crab-shell-proxy** — `/{agent}/v1/...`,
`/alpha/v1/admin/...` — are the proxy's own HTTP API. Those stay REST.

**Enforced by `.github/workflows/mycelium-transport.yml`**, which fails a PR that passes
a `/_adm` path to `fetchMycelium` from a file outside its allowlist. The allowlist is
where the exceptions live, with a reason each — including one the prose version of this
rule denied while the code did it: `app/api/tenants/[id]` reads a gateway-native route
with the session JWT. Read the workflow for the current truth.

## Wire shapes that have already caused bugs

Check the Rust DTO before trusting a field's shape; the reference `mycelium-webapp`
TypeScript types have been wrong about several.

- **`Parent<T, Id>` is externally tagged**: `{"record": {...}}` or `{"id": "<uuid>"}`,
  not a flat object. Reading it flat produced unlabelled roles and hid a whole UI
  affordance.
- **`Email` is `{username, domain}`**, not a string.
- **A permission** arrives as its `0`/`1` discriminant or its string form
  (`"read"`/`"write"`). Normalize both, and match exactly — `"overwrite"` contains
  `"write"`.
- **List results** may be a bare array or `{count, skip, size, records}`. Unwrap both.
- **Page sizes default small** (10 for guest roles). Pass `pageSize` explicitly.
