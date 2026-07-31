# Feature: subscription uninvite

**Status:** implemented — `tsc --noEmit` clean, `next build` clean, 422 vitest tests pass
(32 in `lib/invitations.test.ts`, 7 of them new). Runtime verification against a live
mycelium is still operator-gated: nothing here was exercised against a real gateway.
**Scope:** Medium (webapp only; no proxy change, no new BFF route)
**Extends:** `.specs/features/subscription-invitations/` — read that spec first for the
guest/role model. This one only adds the missing verb and fixes what hid it.

## Problem

On the admin **Members** tab, the "Invite someone" panel offers exactly one action: send an
invitation. Mycelium has always exposed the inverse operation (`uninvite_guest` in REST,
`subscriptionsManager.guests.revokeUserGuestToSubscriptionAccount` over JSON-RPC) and the
reference `mycelium-webapp` surfaces it as `UnInviteGuestModal`, but this webapp has no
equivalent affordance on the invite screen.

There *is* a per-role revoke icon on each roster row — and it is **invisible in practice**,
for a reason that is a genuine bug rather than a design choice. See FR-2.

## Findings (verified against the mycelium source, not assumed)

Source of truth: `/mnt/external/thirdparty-projects/mycelium` (sibling checkout, outside this
repo).

1. **Both verbs already use JSON-RPC.** `app/api/invitations/route.ts` POSTs
   `subscriptionsManager.guests.guestUserToSubscriptionAccount` and DELETEs
   `subscriptionsManager.guests.revokeUserGuestToSubscriptionAccount`, both through
   `myceliumRpc()` → `POST /_adm/rpc`. Nothing in this feature needs to move off REST; the
   "use JSON-RPC for both" requirement was already satisfied before this change.

2. **`guestRole` is an externally-tagged enum, and this webapp parses it wrong.**
   `GuestUser.guest_role` is `Parent<GuestRole, Uuid>`
   (`core/src/domain/dtos/guest_user.rs:28`). `Parent` derives plain `Serialize` with
   `#[serde(rename_all = "camelCase")]` and **no `untagged`**
   (`lib/base/src/dtos/parent.rs:9-18`), so it serializes as:

   ```json
   "guestRole": { "record": { "id": "…uuid…", "name": "alpha", "permission": "write", … } }
   ```

   `Parent::Id` is structurally unreachable on this endpoint: the diesel repository
   `inner_join`s `guest_role` and hard-codes `Some(role)` →
   `Parent::Record` (`adapters/diesel/src/repositories/guest_user/guest_user_fetching.rs:47-80`,
   `.../shared.rs:21-36`), and `guest_user.guest_role_id` is NOT NULL.

   `lib/invitations.ts` typed the field as `{ id?, name? } | string | null` and read
   `gr.id` / `gr.name` — both `undefined` against the real payload. So `roleLabel()` fell
   through to `"unknown"`, `parseRoleLabel()` in `members-panel.tsx` rejected that label, and
   **no revoke button rendered on any guest row**. That is why the operator reports having no
   uninvite option at all.

3. **The embedded record makes the roles cross-reference unnecessary** for labelling: the
   guest listing already inlines `id`, `name`, `slug` and `permission`.

4. **`permission` arrives as a string here** (`"read"` / `"write"` — `Permission` is a
   unit-variant enum with `rename_all = "camelCase"`), not the `0`/`1` discriminants.
   `permissionLevel()` already handles both; no change needed.

5. **`guestRoles.list` silently truncates at 10.** The diesel repo defaults
   `page_size` to 10 (`adapters/diesel/src/repositories/guest_role/guest_role_fetching.rs:140`)
   and `app/api/invitations/roles/route.ts` sends only `{ tenantId }`. A deployment with more
   than 10 guest roles loses roles from the list that both invite *and* uninvite need to
   resolve `(agent, level) → roleId`. Guest roles are **global, not tenant-scoped** (no
   `tenant_id` column on `guest_role`); `tenantId` on that call is a permission scope only.

## Requirements

### FR-1 — Uninvite from the invite panel

- **FR-1.1** The panel gains an action selector with two states: **Invite** (default) and
  **Uninvite**. The three existing inputs — email, agent, access level — are shared by both;
  switching the action rewrites the button, the helper text and the panel heading, never the
  field values.
- **FR-1.2** Uninvite resolves `roleId` from `(agent, level)` through the existing
  `resolveRoleId()`, exactly as invite does. It therefore does **not** depend on roster label
  parsing and works even where FR-2 has not been applied.
- **FR-1.3** Uninvite calls the existing `revokeMember()` → `DELETE /api/invitations` →
  `subscriptionsManager.guests.revokeUserGuestToSubscriptionAccount`. **No new BFF route and
  no new client helper.**
- **FR-1.4** Uninvite is destructive and asks for confirmation before firing, reusing
  `ConfirmDialog` and stating what it does *not* do (the person keeps their workspace and
  files — deleting those is a separate action in the roster below). Invite fires directly.
- **FR-1.5** On success the roster refreshes (`onInvited` / reload bump) and the panel shows a
  notice naming the email, agent and level. Email is cleared, as invite already does.
- **FR-1.6** Failure surfaces the upstream message in the existing error `Alert`. A revoke of
  someone who was never invited is mycelium's answer to report, not something the client
  pre-checks.

### FR-2 — Make the roster's existing revoke reachable (root cause of the report)

- **FR-2.1** `GuestUser.guestRole` is typed and parsed for the real `Parent` shape:
  `{ record: GuestRole }` (the only shape this endpoint produces), `{ id: uuid }` (the other
  `Parent` variant, accepted defensively because it is one line), and the legacy bare-string /
  `{ id, name }` shapes already handled — none of which regress.
- **FR-2.2** `roleLabel()` prefers the **embedded** record's own `name` + `permission` over the
  cross-referenced roles list, so a label resolves even when FR-3 has not been applied or the
  caller lacks `SubscriptionsManager` (a `TenantManager` profile can list guests but is
  refused by `guestRoles.list`).
- **FR-2.3** The roster's revoke stops round-tripping through the badge text. `RosterEntry.roles`
  becomes `RoleGrant[]` — `{ label, roleId, agentKey, level }` — and `revoke()` takes the
  `roleId` mycelium itself put on the guest row.

  This is required *by* FR-2.2, not merely tidier. `members-panel.tsx` used to parse
  `"alpha (write)"` back into `(agent, level)` and re-resolve it via `resolveRoleId(roles, …)`;
  that was safe only while the label had been **built** from the same `roles` array. Once the
  embedded record wins, a role absent from `roles` — exactly the truncation and
  `TenantManager` cases FR-2.2 exists for — still produces a label and therefore a button,
  but re-resolves to `null` and hits `if (!roleId) return`: a **silent no-op**, strictly worse
  than no button. Carrying the id removes the failure mode instead of reporting it.
  `parseRoleLabel()` is deleted.

- **FR-2.4** A roster row that came from the workspace feed alone carries `roleId: null` and
  offers no revoke button — the same outcome as before, now for an explicit reason (there is
  no guest grant behind it) rather than as a side effect of a label that would not parse.

### FR-3 — Do not lose roles to the default page size

- **FR-3.1** `app/api/invitations/roles/route.ts` sends an explicit `pageSize` large enough to
  cover any realistic deployment, because a truncated list makes both verbs refuse a role that
  exists. The response envelope is already unwrapped by `unwrapRecords`.

### NFR

- **NFR-1** Both locales (`en`, `pt`) get real translations for every new key. Two gates
  enforce this: `pt: AdminDict` (tsc, same nesting path) and `lib/i18n/parity.test.ts`
  (fails byte-identical leaves unless allowlisted in `SHARED`).
- **NFR-2** No inline conditional or interpolated `className`; the action toggle uses
  `class-variance-authority` variants, per repo convention.
- **NFR-3** Unit tests cover the `Parent` shape at the `lib/invitations.ts` boundary — the
  parsing bug this feature fixes must not be able to come back silently.

## Non-goals

- **Tenant-level guesting** (`tenantManager.guests.*`) — out of scope, same as the parent spec.
- **Uninvite from all levels of an agent in one click.** Mycelium's RPC takes a single
  `roleId`; a bulk verb would be a client-side loop with partial-failure semantics of its own.
  Per-role is the honest 1:1 mapping.
- **Deleting the person's workspace or files.** Already a separate, explicit action in the
  roster; the confirmation copy says so.
- **Pagination of the guest roster** (parent spec FR-2.3, still unimplemented).
- **Rendering `wasVerified`** — parsed but still unused; unchanged here.

## Traceability

| Req | Where |
|---|---|
| FR-1.1, FR-1.4, FR-1.5, FR-1.6 | `app/admin/invite-member.tsx` |
| FR-1.2, FR-1.3 | `lib/invitations.ts` (`resolveRoleId`, `revokeMember` — both pre-existing) |
| FR-2.1, FR-2.2 | `lib/invitations.ts` (`GuestRoleRef`, `embeddedRole`, `roleRefId`, `roleGrant`) |
| FR-2.3, FR-2.4 | `lib/invitations.ts` (`RoleGrant`, `mergeRoster`) + `app/admin/members-panel.tsx` (`revoke`, `pendingRevoke`; `parseRoleLabel` deleted) |
| FR-3.1 | `app/api/invitations/roles/route.ts` |
| NFR-1 | `lib/i18n/admin.ts` |
| NFR-3 | `lib/invitations.test.ts` |
