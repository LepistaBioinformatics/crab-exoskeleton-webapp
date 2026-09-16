# tenant-subscription-admin — Design

Companion to `spec.md`. Every path is relative to the repository root.

---

## Shape of the change

Three layers, in dependency order.

```
lib/mycelium.ts          error fidelity + response unwrapping   (prerequisite)
  └── lib/myceliumAdmin.ts   typed RPC wrappers, one per method group
        └── app/api/admin/{tenants,accounts,guest-roles}/   BFF routes
              └── lib/tenantAdmin.ts    client helpers
                    └── app/admin/*-panel.tsx   panels
                          └── app/admin/{admin-nav,tabs,columns}.ts   navigation
```

The prerequisite is first for a reason: every panel below reports permission
refusals, and today they all arrive indistinguishable from a bad request.

## Why not the branding template

Branding is the only other instance-wide, scope-free area, so it is the right
model for **where the area sits** — a root row that needs no scope. It is the
wrong model for **how the data moves**: branding reads and writes this app's own
Postgres through `lib/db.ts`, and reaches the gateway only for its authorization
probe. Tenants and accounts live upstream.

The data-flow template is `shared-secrets-panel` and `model-registry-panel`:
a `lib/` helper per resource, a BFF route that forwards the session token, and a
refetch after every write.

## Transport: `lib/mycelium.ts`

`RpcResult` gains the fields the gateway actually sends.

```ts
export type RpcResult<R> =
  | { ok: true; result: R }
  | { ok: false; status: number; message: string; rpcCode?: number; myc?: string };
```

`rpcCode` is the JSON-RPC `error.code`; `myc` is `error.data.code`, the stable
`MYC000xx` discriminator. The existing `status` field stays so the four current
call sites keep compiling and behaving.

Mapping, applied in the routes rather than in the transport, so the transport
stays a faithful carrier:

| JSON-RPC code | Meaning | Error code returned to the client |
|---|---|---|
| `-32401` | `FORBIDDEN` | `forbidden` |
| `-32602` | `INVALID_PARAMS` — also how "not found or not yours" arrives | `invalid_request` |
| anything else | unclassified | `unknown` |

Two facts make this necessary rather than tidy: the endpoint answers HTTP 200
for refusals, and it substitutes an anonymous profile instead of rejecting, so a
refusal is indistinguishable from a bad call without the code.

## Response unwrapping

One helper, React-free and unit-tested, because three shapes reach every list:

```ts
// lib/rpcRecords.ts
export function records<T>(result: unknown): T[]          // array | {records} | null -> []
export function total(result: unknown): number | null     // envelope count, else null
```

`null` is a *result* meaning "nothing matched", never an error. `total` returning
a count greater than the array length is how a route reports truncation, the
idiom `app/api/invitations/route.ts` already uses.

## Wire shapes worth naming in code

Beyond the four already in `.claude/rules/mycelium-transport.md`:

- `Children<T, Id>` is externally tagged like `Parent`, but plural:
  `{"records": [...]}` or `{"ids": [...]}`. `Tenant.owners` and `Account.owners`
  are both `Children`.
- `AccountType` is a plain string for `staff`/`manager`/`user`, and an **object**
  for every tenant-scoped variant — `{"subscription": {"tenantId": "…"}}` and
  siblings. Discriminating a subscription account needs a `typeof` check.
- `TenantStatus` is externally tagged too: `{"verified": {"at", "by"}}`,
  `{"archived": {...}}`, `{"trashed": {...}}`.
- `Owner.email` is a plain `String`, unlike `Email` elsewhere in the same
  payload, which is `{username, domain}`. Both shapes appear in one tenant.
- Tenant `meta` keys are `snake_case` in an otherwise camelCase API, and
  `TenantMetaKey::Custom` passes any string through — an open set, not an enum.
- `Tenant.id` and `Account.id` are nullable on the wire.

## Server-side identity

FR-2 needs the calling user's own id to pass as `ownerId`. `beginners.profile.get`
already returns the profile the branding probe reads; the same call carries the
identity. A new `lib/callerProfile.ts` exposes it once:

```ts
export async function callerProfile(token: string):
  Promise<{ isStaff: boolean; isManager: boolean; userId: string | null } | null>
```

`lib/instanceAdmin.ts` is left alone. It is branding's gate, its single boolean
is correct for that use, and widening it would change a shipped authorization
path for no reason.

The probe route is `GET /api/admin/identity`, returning
`{ isStaff, isManager }` — never `userId`, which the client has no use for and
which the server resolves itself on every write.

## Navigation

A branch root row, following `agents → tenants → subscriptions`, so the selection
is addressable.

```
root ──┬── workspaces  (branch, unchanged)
       ├── directory   (branch, NEW)
       └── branding    (leaf, unchanged)

directory ──┬── tenants column      ?dir=<tenantId>
            └── sections column     ?dirTab=<overview|accounts|roles>
```

The parameters are new rather than reused. `?scope=` and `?tenant=` belong to the
workspaces chain and already have resolution rules tied to `AdminScope[]`; the
directory resolves against the tenant list instead, and sharing a parameter
between two resolvers is how they drift.

Touched, with the compiler catching most of it:

| File | Change |
|---|---|
| `app/admin/admin-nav.ts` | `RailItem` gains `"directory"`; `Authority` gains `canManageDirectory`; `railItems` pushes it; `brandingOnly` corrected (FR-12.4) |
| `app/admin/tabs.ts` | `TAB_KEYS` gains the tab; `resolveRailItem` gains a guard mirroring branding's; `SECTION_TABS` unchanged, deliberately |
| `app/admin/columns.ts` | new root row, new `ColumnKey`s, `RowTextKey`, `RowIcon` |
| `app/admin/column-view.tsx` | `ROW_ICONS`, `rowText` |
| `app/admin/admin-screen.tsx` | `Authority` construction, the `section` guard's exclusion list, `panelOpen`, `select()`'s root case, the panel branch |
| `lib/i18n/admin.ts` | `shell.tabs`, `columns.headings`, `columns.next`, `columns.empty`, plus the panels' own copy, in both locales |

`brandingOnly` is the one silent trap: it reports "there is only one thing here"
from `!hasScopes && canEditBranding`, which a second scope-free item makes false.

## Panels

| Panel | Reads | Writes |
|---|---|---|
| `tenants-panel.tsx` | `managers.tenants.list` | `managers.tenants.create` (with `ownerId`), `managers.tenants.delete` |
| `tenant-detail-panel.tsx` | the list payload, never `tenantManager.tenant.get` | `tenantOwner.tenant.updateNameAndDescription`, `updateArchivingStatus`, `updateVerifyingStatus` |
| `tenant-brand-panel.tsx` | the `brand` tag from the list payload | `tenantManager.tags.create` / `.update`, re-sending the whole meta map |
| `subscription-accounts-panel.tsx` | `subscriptionsManager.accounts.list` | `…createSubscriptionAccount`, `…updateNameAndFlags`, `userManager.account.*`, `tenantManager.accounts.deleteSubscriptionAccount` |
| `guest-roles-panel.tsx` | `guestManager.guestRoles.list` | `…create`, `…updateNameAndDescription`, `…updatePermission`, `…delete` |

House idioms, not restated per panel: `null` state means "not loaded" and renders
a spinner while an empty array renders the empty copy; destructive actions go
through `ConfirmDialog`; busy state is a key, not a boolean; a write is followed
by a refetch, never an optimistic patch; read-only mode removes a form from the
tree rather than disabling it.

## The detail view, and why it does not fetch

`tenantManager.tenant.get` denies a staff caller who is not an owner. The list
does not: `filter_tenants_as_manager` attaches owners and tags to every row it
returns (`adapters/diesel_sqlite/.../tenant_fetching.rs:253-291`), and `Tag`
carries `id`, `value` and `meta`. So the detail panel renders from the row the
list already holds, and the brand panel finds both the logo and the `tagId` it
needs there too.

This is not an optimisation — it is the only version that works for the caller
this area is built for.

Two consequences worth stating rather than rediscovering. `owners` arrives as
`Children::Ids`, a list of **user ids**, so ownership is decided by comparing the
caller's own id — which is why `callerProfile` returns it. And the repository's
default `page_size` is 10, which is why every list call passes one explicitly.

## Brand logo

`app/chat/tenant-brand.ts` already defines the read side; the write side must
produce exactly what it reads. Encoding happens in the browser: downscale to the
long edge the sidebar renders, encode WebP with a JPEG fallback, and refuse
anything still over the limit rather than sending it — the payload is a data URL
inside a JSON-RPC body, and the gateway is not a file server.

`meta` is re-sent whole on every write. The map is replaced, not merged, so a
logo write that omits `primaryColor` silently deletes it.

The brand write is deliberately **not** owner-scoped. `tenantManager.tags.*`
guards on `get_related_accounts_or_tenant_wide_permission_or_error`, which
carries the staff short-circuit that `with_tenant_ownership_or_error` — the guard
behind the `tenantOwner.tenant.*` mutators — does not. A staff caller who does
not own the tenant can still set its logo. That asymmetry is the gateway's, and
routing brand writes through an owner-only path to make it look consistent would
remove a capability for no gain.

## Failure reporting

| Situation | Shown |
|---|---|
| `-32401` on any call | the `forbidden` copy |
| `-32602` on a tenant mutation | "not found, or not owned by you" — both, because the gateway does not distinguish them |
| `-32602` elsewhere | the `invalid_request` copy |
| transport failure | the existing `connectivity` copy |
| `result: null` on a list | the panel's empty state |

## Tests

React-free modules get unit tests: `lib/rpcRecords.ts` across all three shapes
including `null`, the error mapping, and every navigation change in
`admin-nav.test.ts`, `tabs.test.ts` and `columns.test.ts` — which are truth
tables and will fail loudly when the new item is added.

Component tests follow the existing jsdom idiom: the `// @vitest-environment jsdom`
pragma, `createRoot` + `act`, `vi.mock` of the `lib/` helper, and assertions read
from the real dictionary rather than hardcoded strings. There is no Testing
Library in this repo.

`lib/i18n/parity.test.ts` fails on any leaf string identical in both locales
unless registered in `SHARED`. Tenant, account and role copy will hit this —
"status" and "tags" are the obvious candidates.

## Out of the code path

The staff bootstrap is not reachable from here and is not meant to be: its routes
are public, REST-only and one-shot, and whether an instance is still claimable is
database state. The console requires a caller who is already staff or manager.
