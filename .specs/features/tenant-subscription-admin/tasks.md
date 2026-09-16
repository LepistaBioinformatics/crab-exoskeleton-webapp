# tenant-subscription-admin — Tasks

**Status: T-01 … T-14 done on `feat/tenant-subscription-admin`. T-15 (manual UAT
against the running stack) is not done and cannot be — it needs the stack up and a
staff session.**

Verified at the end of T-14: `yarn test` 1813 passing across 140 files,
`next build` clean with all eight new routes registered, the
`mycelium-transport.yml` grep passing with its allowlist untouched, and all 24 RPC
method strings checked against `ports/api/src/rpc/method_names.rs` at the pinned
commit — none invented.


`[P]` marks tasks with no dependency on each other that can run in parallel.

**Gate for every task:** `yarn test` and `yarn build` both pass. `yarn lint` does
not run in this repository and `tsc` is only invoked through `yarn build`.

**Rule that applies to every task touching `app/api/**` or `lib/**`:** the
gateway is called with `myceliumRpc`. No new file passes a `/_adm` path to
`fetchMycelium`; `.github/workflows/mycelium-transport.yml` fails the PR for it,
and its allowlist is not to be extended. Never write a method name that was not
read from `ports/api/src/rpc/method_names.rs` — an invented one fails at runtime
looking exactly like a permissions problem.

---

## Phase 1 — Transport

### T-01 — RPC error fidelity and record unwrapping

**What:** Carry the JSON-RPC error code and `error.data.code` through
`myceliumRpc`, and add the list-shape helper every route below needs.
**Where:** `lib/mycelium.ts`, new `lib/rpcRecords.ts`, new `lib/rpcErrors.ts`.
**Depends on:** nothing.
**Done when:** `RpcResult`'s failure arm carries `rpcCode` and `myc` alongside
the existing `status` and `message`; `records<T>()` returns `[]` for `null`,
unwraps a bare array and a `{records}` envelope; `total()` returns the envelope's
count or `null`; `-32401` maps to `forbidden` and `-32602` to `invalid_request`.
**Tests:** unit, all three list shapes including `null`, and each error mapping.
**Watch:** the four existing `myceliumRpc` call sites must behave identically on
the success path. This is an additive change to the failure arm only.

### T-02 — Caller identity probe

**What:** One server-side read of `beginners.profile.get` exposing `isStaff` and
`isManager` separately, plus the caller's own user id for FR-2.
**Where:** new `lib/callerProfile.ts`, new `app/api/admin/identity/route.ts`.
**Depends on:** T-01.
**Done when:** `callerProfile(token)` returns `{isStaff, isManager, userId}` or
`null`; the route returns `{isStaff, isManager}` and **never** `userId`.
**Tests:** unit on the profile parse, including the `{noOne: true}` sentinel that
appears instead of an empty array.
**Watch:** `lib/instanceAdmin.ts` is not modified. It gates branding, its single
boolean is right for that, and widening it changes a shipped authorization path.

---

## Phase 2 — BFF routes

All four depend on T-01 and T-02 and on nothing else, so they are parallel.

### T-03 [P] — Tenants

**What:** List, create and delete tenants; rename, archive and verify.
**Where:** `app/api/admin/tenants/route.ts`, `app/api/admin/tenants/[id]/route.ts`.
**Done when:** GET calls `managers.tenants.list` with an explicit `pageSize` and
passes `name` through as a search term; POST calls `managers.tenants.create` with
`ownerId` resolved **server-side** from `callerProfile`, never from the body;
DELETE calls `managers.tenants.delete`; PATCH routes to
`tenantOwner.tenant.updateNameAndDescription`, `updateArchivingStatus` or
`updateVerifyingStatus`.
**Tests:** unit on param construction and on the `-32602` mapping.
**Watch:** a `-32602` from any of the three mutators means "not found **or** not
yours" and must be surfaced as both. Do not add a `tenantManager.tenant.get`
call — it denies the staff caller this area exists for, and the list already
returns the tags and owner ids a detail view needs. Pass `pageSize` explicitly:
the repository defaults it to 10.

### T-04 [P] — Subscription accounts

**What:** List, create, rename, change status, delete.
**Where:** `app/api/admin/subscription-accounts/route.ts` and `[id]/route.ts`.
**Done when:** GET calls `subscriptionsManager.accounts.list` always passing
`tenantId` and an explicit `pageSize`, one `accountType` per call; POST calls
`subscriptionsManager.accounts.createSubscriptionAccount`; PATCH covers
`updateNameAndFlags` and the six `userManager.account.*` transitions; DELETE
calls `tenantManager.accounts.deleteSubscriptionAccount`.
**Tests:** unit on param construction and truncation reporting.
**Watch — load-bearing:** the create path uses
`createSubscriptionAccount` and nothing else. It is what emits
`subscriptionAccount.created`, which is what provisions the agent workspace
through the proxy's `POST /v1/accounts`. Say so in a comment at the call site.
Do **not** reproduce the reference SPA's merged multi-type listing: its own
source calls the merged pagination best-effort, and it drops a failing
sub-request without surfacing anything.

### T-05 [P] — Guest roles, listed only

**What:** List guest roles. No write route.
**Where:** `app/api/admin/guest-roles/route.ts`.
**Done when:** GET calls `guestManager.guestRoles.list` with an explicit
`pageSize`, and the file exposes no other method.
**Tests:** none of its own; covered through the panel.
**Watch:** do not add create/rename/permission/delete here or under `[id]`. The
gateway config declares roles and propagation creates them at boot with
`get_or_create` matching on `(slug, permission)` — it never updates. A write from
here is undone at the next start, duplicated into two rows with the grants on the
wrong one, or grantable but routed nowhere. `guestManager.guestRoles.list` takes
no `tenantId` and is the listing a staff caller can rely on; the
`subscriptionsManager.guestRoles.list` sibling that
`app/api/invitations/roles/route.ts` already uses is a different method with a
different guard — leave it alone, it serves the members panel.

### T-06 [P] — Tenant brand tag

**What:** Write the tenant `brand` tag carrying the logo.
**Where:** `app/api/admin/tenants/[id]/brand/route.ts`.
**Done when:** the route calls `tenantManager.tags.create` when no `brand` tag
exists and `tenantManager.tags.update` when one does, and sends the complete
`meta` map every time.
**Tests:** unit proving an existing `primaryColor` survives a logo-only write,
and that a tenant with no `brand` tag takes the create path.
**Watch:** a tag write replaces the whole meta map. The shape written must be
exactly what `app/chat/tenant-brand.ts:35-39` reads — tag `value === "brand"`,
`meta.base64Logo`, `meta.primaryColor` — or the sidebar avatar silently stops
resolving.

---

## Phase 3 — Client and navigation

### T-07 — Client helpers

**What:** The `lib/` layer the panels call. No panel calls `fetch` directly.
**Where:** new `lib/tenantAdmin.ts`.
**Depends on:** T-03, T-04, T-05, T-06.
**Done when:** one typed function per operation, each throwing
`new Error(await errorCode(res))` on failure, matching `lib/admin.ts`.
**Tests:** none of its own; covered through the panels.

### T-08 — Navigation model

**What:** Add the directory as a branch root row, addressable in the URL.
**Where:** `app/admin/admin-nav.ts`, `tabs.ts`, `columns.ts`, `column-view.tsx`,
`admin-screen.tsx`.
**Depends on:** T-02 (the `Authority` flag comes from the identity probe).
**Done when:** `RailItem` carries `"directory"`; `Authority` carries
`canManageDirectory`; the tenants column and the section column resolve from
`?dir=` and `?dirTab=`; every parameter resolves against the tenant list the
caller actually has, falling back to the selection step otherwise.
**Tests:** extend `admin-nav.test.ts`, `tabs.test.ts`, `columns.test.ts`.
**Watch — the three the compiler will not catch:**
`brandingOnly` must stop claiming a lone item once a second scope-free item
exists; `resolveRailItem` needs a guard mirroring branding's, or a hand-typed
`?tab=directory` from a caller who also has scopes silently lands on
`workspaces`; and the tab must **not** join `SECTION_TABS`, which would make it
appear inside every agent and scope path.

---

## Phase 4 — Panels

All depend on T-07 and T-08.

### T-09 [P] — Tenants panel
**Where:** `app/admin/tenants-panel.tsx`.
**Done when:** list with search and empty state, create form naming the caller as
owner in its copy, delete behind `ConfirmDialog` warning that subscription
accounts and their workspaces are not removed, brand logo shown per row.

### T-10 [P] — Tenant detail panel
**Where:** `app/admin/tenant-detail-panel.tsx`.
**Done when:** renders from the list row; offers rename, archive/unarchive and
verify; a `-32602` renders the "not found, or not owned by you" copy.

### T-11 [P] — Tenant brand panel
**Where:** `app/admin/tenant-brand-panel.tsx`.
**Done when:** upload downscales and encodes client-side, refuses an
over-limit result rather than sending it, and previews what the chat sidebar
will render.

### T-12 [P] — Subscription accounts panel
**Where:** `app/admin/subscription-accounts-panel.tsx`.
**Done when:** list with search, create, rename, the status transitions each
behind a confirmation naming the account, delete warning that the workspace
survives, and a link to the existing members surface for the account.

### T-13 [P] — Guest roles panel
**Where:** `app/admin/directory-roles-panel.tsx`.
**Done when:** lists name, permission and the system flag, with a search; states
that roles come from the gateway configuration and are created when the gateway
starts; offers no write control at all. The copy states that a role's name is the
agent key and that read and write roles are what make an agent grantable.

---

## Phase 5 — Copy and verification

### T-14 — i18n

**What:** Every string of the new area, in both locales.
**Where:** `lib/i18n/admin.ts`, `lib/i18n/errors.ts`.
**Depends on:** T-09 … T-13.
**Done when:** `en` and `pt` are complete and `tsc` accepts `pt: AdminDict`.
**Watch:** `lib/i18n/parity.test.ts` fails on any leaf identical in both locales
unless registered in `SHARED` with a reason — "status" and "tags" will hit it.
Identifiers are never translated: tenant, account and role names, ids and
permission discriminants render verbatim.

### T-15 — Manual UAT against the running stack

**What:** Walk the path the quick start will describe, on a fresh volume.
**Depends on:** everything.
**Done when:** signed in as the staff account, an operator can create a tenant,
see it listed, rename it, set its logo and see that logo appear in the chat
sidebar, create a subscription account under it, create the read and write guest
roles for an agent, grant themselves write access through the existing members
panel, and chat — without opening `mycelium-webapp` once.
**Watch:** verify that creating the subscription account actually provisioned the
workspace, rather than only creating a mycelium record. That is the
`subscriptionAccount.created` webhook doing its job, and it is the one failure
this feature could introduce that no test would catch.

---

## Not in this plan

Removing the service, its port, its CORS origin, its Dockerfile and the
quick-start steps that point at it is the product repository's work, specified in
`zombie-crab-project/.specs/features/mycelium-webapp-retirement/`. It lands after
this, in the same chain.
