# tenant-subscription-admin — Specification

**Status:** Draft
**Size:** Large (webapp: new admin area + RPC surface; product repo: service removal + docs)
**Reference implementation:** `mycelium-webapp` at the commit this stack pins,
`4a01dbff13d5ef00cd2354d856337abc2a7c0405` (v1.1.2) —
`src/screens/Dashboard/components/{Tenants,Accounts,GuestRoles}/`
**Gateway source:** `mycelium` at `9298ecb44a69ced91cb2d7d3356a716aedca858b` (9.0.0-rc.13),
the commit `fungi/mycelium/Dockerfile.standalone` builds.

---

## Problem

Tenants and subscription accounts are the top of this stack's access model: a
subscription account is what a workspace belongs to, and a guest role's name is
an agent key. All of it is administered today in `mycelium-webapp`, a separate
single-page app the stack builds from upstream and publishes on its own port
purely so an operator has somewhere to click.

That leaves the admin console half a console. It can already invite and revoke
members of a subscription account, and it already reads tenant and account names
to label the workspace tree — but it cannot create the tenant, create the
subscription account, or create the guest role that makes an agent grantable.
The quick-start says so plainly: steps 5 and 6 send the reader to
`http://localhost:8081`, and they are the only documented way to reach a working
install.

Running a second admin UI for three verbs costs more than the verbs. It is an
extra image in every build, an extra published port, an extra origin in the
gateway's CORS allowlist, and a second place an operator has to learn, sign in
to, and reason about permissions in.

## Goal

Manage tenants, subscription accounts and guest roles from the crab admin
console, over the same JSON-RPC transport the console already uses, so that
`mycelium-webapp` can be removed from the stack without losing an operator
capability the stack depends on.

## Key findings (verified, not assumed)

Every claim below was read in the pinned sources named above. Line references
are to those trees.

1. **A magic-link user can be staff, and this instance's already is.**
   `is_staff` is derived from `account_type` alone
   (`adapters/diesel_sqlite/.../profile_fetching.rs:81`); the provider is not an
   input — `grep -rni provider core/src/domain/dtos/profile/` returns nothing.
   The `staffBootstrapSecret` flow calls the ordinary `verify_magic_link`
   use-case unmodified and then creates `AccountType::Staff`
   (`claim_staff_bootstrap.rs:58-69`). The stack's own `STATE.md` AD-008 records
   claiming it and then signing in to the same account through the ordinary
   magic-link flow. The "Invalid provider" 400 recorded in `lib/mycelium.ts` is
   local to one REST handler that needs an issuer string
   (`beginners/account_endpoints.rs:122-135`); it says nothing about staff.

2. **Every operation this feature needs has a registered RPC method.** Read from
   the registry, `ports/api/src/rpc/method_names.rs` (188 lines), not inferred:
   `managers.tenants.{create,list,delete,includeTenantOwner}`,
   `tenantOwner.tenant.{updateNameAndDescription,updateArchivingStatus,updateVerifyingStatus}`,
   `subscriptionsManager.accounts.{createSubscriptionAccount,list,get,updateNameAndFlags}`,
   `tenantManager.accounts.deleteSubscriptionAccount`,
   `userManager.account.{activate,deactivate,approve,disapprove,archive,unarchive}`,
   `guestManager.guestRoles.{create,list,delete,updateNameAndDescription,updatePermission}`,
   `tenantManager.tags.{create,update}`. Nothing needed here is REST-only, so the
   whole feature stays inside the transport rule
   (`.claude/rules/mycelium-transport.md`) and its CI check.

3. **Creating a subscription account is what provisions an agent workspace.**
   The proxy's `POST /v1/accounts` is authenticated as mycelium's
   `subscriptionAccount.created` webhook (`docker-compose.yaml:226-227` in the
   product repo). The RPC that emits it is
   `subscriptionsManager.accounts.createSubscriptionAccount`. Creating an
   account any other way leaves a mycelium record with no workspace behind it,
   and nothing reports the omission.

4. **Staff can create a tenant but not edit one.** `managers.tenants.create`
   guards on `has_admin_privileges_or_error` (`create_tenant.rs:45`), which staff
   satisfies. All four `tenantOwner.tenant.*` mutators guard on
   `with_tenant_ownership_or_error` (`update_tenant_status.rs:38`), the one
   permission helper in the gateway with **no** staff or manager bypass
   (`core/src/domain/dtos/profile/mod.rs:527-560`). `create_tenant` takes
   `ownerId` and stores that user as owner (`create_tenant.rs:51,70`), and
   ownership reaches the profile through an email join
   (`licensed_resources_fetching.rs:169-180`), so naming the caller as owner at
   creation is what makes the tenant editable afterwards.

5. **Staff can list tenants but cannot fetch one.** `tenantManager.tenant.get`
   calls `get_ids_or_error` (`get_tenant_details.rs:29`), which returns an empty
   vector for a staff profile carrying no licensed resources
   (`profile/mod.rs:888-900`); the empty vector then fails the non-empty check at
   `:53` and falls through to `with_tenant_ownership_or_error` at `:63`, which
   denies. `managers.tenants.list` is unaffected. A console built naively gets a
   working list and a detail view that 403s.

6. **Renaming a tenant fails as "not found", not "forbidden".**
   `update_tenant_name_and_description` has no Profile guard at all; its only
   scoping is `get_tenant_owned_by_me(tenant_id, profile.get_owners_ids())`
   (`:40`). A non-owner receives `FetchResponseKind::NotFound` → `MYC00013` →
   JSON-RPC `-32602 INVALID_PARAMS` (`rpc/errors.rs:41`). The BFF cannot tell a
   bad id from someone else's tenant.

7. **The RPC endpoint always answers HTTP 200.** Auth failures included
   (`rpc/handlers.rs:285,302,316,340`). `FORBIDDEN` is a non-standard `-32401`
   (`rpc/types.rs:11`) and the stable machine-readable discriminator is
   `error.data.code`, a `MYC000xx` string (`rpc/errors.rs:55`). The dispatcher
   substitutes an **anonymous** profile rather than rejecting when the caller is
   forbidden (`handlers.rs:248-271`) — which fails closed, but means every real
   guard lives in the use-case, never at the endpoint.

8. **`myceliumRpc` currently discards all of that.** `lib/mycelium.ts:117-120`
   maps any `json.error` to a flat `status: 400` and keeps only `message`. Four
   call sites tolerate it today because they are rarely refused. An
   administration console refused for a real reason would report
   "something went wrong".

9. **List results come back in three shapes.** A bare array
   (`response_kind.rs:37`), `{count, skip, size, records}` (`:44-54`), or
   **`null`** when nothing matched (`:60`) — `null` is a result, not an error.
   `DeletionResponseKind::Deleted` is likewise `result: null` (`:127`).

10. **The tenant brand logo is already rendered by this app.**
    `app/chat/tenant-brand.ts:35-39` reads the tenant tag whose `value` is
    `"brand"` and returns `meta.base64Logo` and `meta.primaryColor`;
    `components/ui/avatar.tsx` draws it in the workspace sidebar. Setting it
    exists only in the SPA, so removing the SPA without replacing this makes
    every new tenant permanently fall back to an initials avatar.

11. **A tag write replaces the whole meta map.** The SPA's own comment says so
    (`BrandCard.tsx:251-253`): omitting a field silently drops it. Colour and
    fonts must be re-sent alongside a logo write.

12. **`subscriptionsManager.accounts.list` requires `tenantId` for a staff
    caller** (`list_accounts_by_type.rs:77-87`). There is no "list every account"
    view. `guestManager.guestRoles.list` takes no `tenantId` at all and is the
    one role listing a staff caller can rely on; the
    `subscriptionsManager.guestRoles.list` sibling structurally refuses a pure
    TenantManager (`guest_role/list_guest_roles.rs:31-38`) and defaults
    `tenantId` to nil when omitted.

13. **A manager is not a staff.** `userManager.account.*` each carry a second
    gate, `if profile.is_manager && !profile.is_staff`
    (`change_account_activation_status.rs:86` and siblings), refusing a manager
    acting on a privileged target. `isInstanceAdmin` (`lib/instanceAdmin.ts:7-14`)
    collapses both flags into one boolean and cannot express this.

15. **Guest roles are propagated from the gateway config, and propagation only
    ever CREATES.** `propagate_declared_roles_to_storage_engine` walks the
    declared `ProtectedByRoles` entries and calls `get_or_create` for each
    (`propagate_declared_roles_to_storage_engine.rs:89-104`), and the repository
    matches an existing row on **`(slug, permission)`**
    (`adapters/diesel_sqlite/.../guest_role_registration.rs:45-47`). Nothing
    updates a row that already exists. Every mutation from outside the config
    therefore ends badly: a **created** role is one no route references, so the
    agent it names routes nowhere; a **rename** stops the declared slug matching,
    so the next boot creates a fresh empty role beside the renamed one and the
    grants stay on the orphan; a **permission change** does the same, because the
    match key includes the permission; a **delete** is undone at the next boot,
    except for the grants, which are gone.

14. **The tenant list payload carries tags and owners; the tenant detail call is
    not needed.** `filter_tenants_as_manager` loads owners and tags in two
    `belonging_to` queries and attaches them to every returned tenant
    (`adapters/diesel_sqlite/.../tenant_fetching.rs:253-291`). `Tag` carries
    `id`, `value` and `meta` (`core/src/domain/dtos/tag.rs:8-12`), so the brand
    tag, its `meta.base64Logo` and the `tagId` an update needs all arrive with
    the list. `owners` arrives as `Children::Ids` — user ids, not records
    (`tenant_fetching.rs:289`) — which is enough to tell whether the caller owns
    a tenant, since `create_tenant` stores the owner from a user id
    (`create_tenant.rs:51`). Two further details from the same function: the
    default `page_size` is **10** (`:246`), and an empty result is
    `FetchManyResponseKind::NotFound`, which serializes as `result: null`
    (`:296-298`), confirming finding 9 for this call specifically.

## Non-goals

| Excluded | Reason |
|---|---|
| Claiming the first staff account from the console | The bootstrap routes are public, REST-only and one-shot, and their state lives in the database. A fresh install still claims staff through `/_adm/instance/bootstrap`; this console requires an already-staff caller. |
| Error codes, webhook registration, service discovery, API tokens | The SPA screens for these are a developer lookup table, a one-time setup registration, a read-only view of a config file owned by another repository, and self-service token management. None is part of running this stack day to day. |
| Promoting an account to staff or manager | `staff.accounts.upgradePrivileges` is a setup-once action for the one or two humans who run the stack. A single RPC call covers it. |
| Tenant legal fields, notification addresses, Telegram integration | Nothing in this stack reads them. |
| Tenant owners and managers panels | Ownership is acquired at creation (FR-2). Managing owners beyond that is a separate feature; `managers.tenants.includeTenantOwner` remains available by hand. |
| Child guest roles and the system-role initializer | Nesting and seeding are bootstrap concerns, not daily ones. |
| Creating, renaming, re-permissioning or deleting a guest role | The gateway config declares them and propagation creates them at boot, matching on `(slug, permission)` and never updating. A write from here is undone, duplicated, or grantable but unroutable. See finding 15. |
| A "list every account" view | The gateway has no such call for staff (finding 12). |

## Requirements

### FR-1 — Tenant list

1. WHEN a staff or manager opens the tenants area THEN the system SHALL list
   tenants via `managers.tenants.list`, passing `pageSize` explicitly.
2. The list SHALL show each tenant's name, its id, and whether it is archived or
   verified, and SHALL offer a name search backed by the method's `name` param.
3. WHEN the result is `null` THEN the system SHALL render the empty state, not
   an error (finding 9).
4. The system SHALL NOT call `tenantManager.tenant.get` to populate a detail
   view for a staff caller (finding 5); detail SHALL be resolved from the list
   payload, which carries what the detail view needs (finding 14).

### FR-2 — Tenant create, naming the caller as owner

1. WHEN an admin submits a new tenant's name and optional description THEN the
   system SHALL call `managers.tenants.create` with `ownerId` set to the
   **calling user's own id**, so the tenant is editable by its creator
   (finding 4).
2. The caller's user id SHALL be resolved server-side from the session, never
   accepted from the client.
3. WHEN creation succeeds THEN the system SHALL refetch the list rather than
   inserting optimistically, matching every other panel in this codebase.
4. The system SHALL state in the UI that the creator becomes the tenant's owner.

### FR-3 — Tenant rename and archive

1. The system SHALL offer rename via `tenantOwner.tenant.updateNameAndDescription`
   and archive/unarchive via `updateArchivingStatus`.
2. The system SHALL NOT offer verify, and SHALL expose no route for it. The
   verified state is still **reported** as a badge — reading a state is not the
   same as driving it.
3. WHEN either returns `-32602` THEN the system SHALL surface a message saying the
   tenant was not found **or** is not owned by the caller, naming both
   possibilities, because the gateway does not distinguish them (finding 6).
4. The system SHALL mark which listed tenants the caller owns, by comparing the
   caller's own user id against the tenant's `owners` ids (finding 14). The
   controls SHALL still be offered for tenants the caller does not own, and the
   refusal reported when it comes: ownership can be granted outside this console,
   and a control hidden on a stale read is worse than one that explains a refusal.

### FR-4 — Tenant delete

1. The system SHALL offer deletion via `managers.tenants.delete`, behind
   `ConfirmDialog`, naming the tenant.
2. The confirmation SHALL state that subscription accounts under the tenant, and
   the workspaces behind them, are not removed by this call.

### FR-5 — Tenant brand logo

1. The system SHALL let an admin upload an image for a tenant, stored as the
   tenant tag whose `value` is `"brand"`, with the image in `meta.base64Logo`,
   matching exactly what `app/chat/tenant-brand.ts` already reads (finding 10).
2. The write SHALL use `tenantManager.tags.create` for a tenant with no brand
   tag and `tenantManager.tags.update` for one that has it, and SHALL re-send
   every existing `meta` key alongside the new logo, because a tag write replaces
   the whole map (finding 11). The `tagId` an update needs comes from the tag the
   list payload already carries (finding 14).
3. The image SHALL be downscaled and encoded client-side to a data URL before
   upload, and the system SHALL refuse one that still exceeds the configured
   size limit rather than sending it.
4. WHEN a tenant has a brand logo THEN the tenants list SHALL show it, so the
   admin sees what the chat sidebar will show.
5. The brand write SHALL NOT be routed through an owner-scoped path.
   `tenantManager.tags.*` guards on
   `get_related_accounts_or_tenant_wide_permission_or_error`, which **does**
   carry the staff short-circuit — unlike the `tenantOwner.tenant.*` mutators of
   FR-3. A staff caller can set a tenant's logo without owning it, and that is
   correct, not an oversight to be tightened later.

### FR-6 — Subscription account list and create

1. WHEN a tenant is selected THEN the system SHALL list its subscription
   accounts via `subscriptionsManager.accounts.list`, always passing `tenantId`
   (finding 12) and an explicit `pageSize`, with a search term.
2. The system SHALL request **one** `accountType` per call and SHALL NOT
   reproduce the SPA's merged multi-type listing, whose own source calls its
   pagination best-effort and which drops a failing sub-request silently.
3. WHEN an admin creates a subscription account THEN the system SHALL call
   `subscriptionsManager.accounts.createSubscriptionAccount` — **this method and
   no other** — because it is what emits `subscriptionAccount.created` and
   therefore what provisions the agent workspace (finding 3). This requirement
   is load-bearing and SHALL be named in the code comment at the call site.
4. The account list SHALL show each account's name, id, and status flags, and
   SHALL link to the existing members surface for that account.

### FR-7 — Subscription account rename

1. The system SHALL offer rename via
   `subscriptionsManager.accounts.updateNameAndFlags`.
2. The system SHALL NOT offer the status lifecycle — activate/deactivate,
   approve/disapprove, archive/unarchive — and SHALL expose no route for it. Those
   states belong to mycelium; this console reports them as badges and does not
   drive them.

### FR-8 — Subscription account delete

1. The system SHALL offer deletion via
   `tenantManager.accounts.deleteSubscriptionAccount`, behind `ConfirmDialog`.
2. The confirmation SHALL warn that the workspace provisioned for the account is
   not removed by this call.

### FR-9 — Guest roles, listed only

1. The system SHALL list guest roles via `guestManager.guestRoles.list` with an
   explicit `pageSize` (finding 12), showing each role's name, permission and
   whether it is a system role.
2. The system SHALL NOT offer create, rename, permission change or delete, and
   SHALL expose no BFF route for any of them. **The gateway's configuration file
   is the only place a guest role is created or changed** (finding 15).
3. The UI SHALL state that roles come from the gateway configuration and are
   created when the gateway starts, so a read-only list does not read as a broken
   one.
4. The UI SHALL state that a role's **name is the agent key** and that the read
   and write roles for an agent are what make it grantable — the fact
   `lib/invitations.ts` already relies on.

### FR-10 — Authorization

1. The system SHALL expose a server-side probe returning `isStaff` and
   `isManager` **separately**, read from `beginners.profile.get`, rather than
   reusing `isInstanceAdmin`'s single boolean (finding 13).
2. The new admin area SHALL be offered only to a caller who is staff or manager.
3. The gate in the UI is a convenience. Every BFF route SHALL forward the
   session token and let the gateway refuse, and SHALL surface the refusal
   faithfully; no route SHALL decide authorization locally.
4. `isInstanceAdmin` SHALL keep its current shape and behaviour for branding.

### FR-11 — RPC error fidelity

1. `myceliumRpc` SHALL preserve the JSON-RPC error `code` and, when present,
   `error.data.code`, alongside the message (finding 8).
2. A `-32401` SHALL map to the `forbidden` error code, and `-32602` SHALL map to
   `invalid_request`, so a permission refusal and a malformed call are
   distinguishable in the UI.
3. New error codes SHALL be added to **both** the `en` and `pt` dictionaries in
   `lib/i18n/errors.ts`, and any string identical in both locales SHALL be
   registered in `parity.test.ts`'s `SHARED` set with a reason.
4. Changing `myceliumRpc` SHALL NOT change the behaviour seen by its four
   existing call sites for the success path.

### FR-12 — Navigation

1. The new area SHALL be a root row in the admin column model, alongside
   `workspaces` and `branding`.
2. It SHALL be a **branch**: selecting it opens a tenants column, and selecting a
   tenant opens that tenant's sections. The selection SHALL be addressable in the
   query string, so a reload, a shared link and Back all resolve to the same
   place — the property `admin-screen.tsx` documents as the reason the screen was
   rebuilt.
3. Every query parameter SHALL be resolved against what the caller can actually
   use, matching `resolveScope`/`resolveAgent`, so a hand-edited or stale value
   falls back to the selection step rather than rendering a view the caller has
   no authority over.
4. `brandingOnly` SHALL be corrected: it claims a caller with no scopes and
   branding rights has exactly one item, which a second scope-free item makes
   false.
5. The new tab SHALL NOT be added to `SECTION_TABS`; it is instance-wide, not a
   section of a workspace.

### FR-13 — BFF routes

1. Every gateway call SHALL go through `myceliumRpc`. No new route SHALL pass a
   `/_adm` path to `fetchMycelium`; the CI check enforces this and its allowlist
   SHALL NOT be extended.
2. Routes SHALL use `requireSession()` and SHALL return the established error
   codes, never upstream prose.
3. Every list route SHALL accept a bare array, a `{records}` envelope and `null`
   (finding 9), and SHALL report truncation when the envelope's `count` exceeds
   what was returned, as `app/api/invitations/route.ts` already does.

### FR-14 — i18n

1. Every string the new area renders SHALL come from `lib/i18n/admin.ts`, in both
   locales.
2. Identifiers SHALL NOT be translated: tenant names, account names, guest-role
   names, ids and permission discriminants are system-owned and render verbatim.

### NFR

1. **No optimistic updates.** Refetch after every write, matching every existing
   panel.
2. **Gate:** `yarn test` and `yarn build` both pass. `yarn lint` cannot run in
   this repo and `tsc` is only invoked through `yarn build`.
3. **Pure logic outside components.** Navigation rules, response unwrapping and
   permission mapping go in React-free modules with tests, matching
   `admin-nav.ts` and `columns.ts`.
4. **No new dependency.**

## Traceability

| Requirement | Retires from `mycelium-webapp` |
|---|---|
| FR-1, FR-2, FR-3, FR-4 | `/dashboard/tenants` and the Advanced tab's tenant delete |
| FR-5 | The tenant Details → Brand tab |
| FR-6, FR-7, FR-8 | `/dashboard/tenants/:tenantId/accounts` |
| FR-9 (listing only) | `/dashboard/guest-roles` — its create, rename, permission and delete affordances are **not** ported; see finding 15 |
| Already shipped (`subscription-invitations`) | The invite/revoke curtain of the accounts screen |
| Non-goal | `/dashboard/error-codes`, `/dashboard/webhooks`, `/dashboard/discovery`, `/dashboard/accounts`, `/dashboard/profile`, `/login` |

Removing the service itself — the compose block, the published port, the CORS
origin, the environment variables, `fungi/mycelium-webapp/`, and the quick-start
steps that send the reader to it — belongs to the product repository and is
specified there.
