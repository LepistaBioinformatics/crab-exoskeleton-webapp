# subscription-invitations — Specification

**Status:** Draft
**Size:** Medium (webapp-only; no proxy change, no gateway change)
**Reference implementation:** `mycelium-monorepo/modules/mycelium-webapp`
(`src/screens/Dashboard/components/Accounts/{GuestToAccountModal,AccountInvitations,UnInviteGuestModal}.tsx`
+ `src/services/rpc/subscriptionsManager.ts`)

---

## Problem

A subscription account exists and its agents are configured, but there is no way
to bring anyone into it from the crab UI. Today granting a member access means
going to the mycelium dashboard (or the API) and guesting them onto the
subscription account with the agent's guest role. The admin screen already shows
who is in a subscription (`MembersPanel` → `GET /v1/admin/users`), so the gap is
visible right where it hurts: a list of members with no way to add one.

## Goal

Invite a person by email to a subscription account with a chosen agent + access
level, list pending and active guests, and revoke — all from the crab admin
screen, reusing mycelium's guest machinery rather than inventing a parallel
invitation store.

## Key findings (verified, not assumed)

1. **Guest-role name == agent name.** The gateway config declares
   `group = { protectedByRoles = [{ name = "alpha", permission = "write" }] }`,
   and mycelium auto-creates declared roles at boot
   (`propagate_declared_roles_to_storage_engine`). So "invite to agent alpha" is
   literally "guest with the role named alpha".
2. **Permission is a property of the guest role**, not of the guesting call:
   `GuestRole` carries `permission`, and
   `guestUserToSubscriptionAccount` takes only `{tenantId, accountId, roleId,
   email}`. Read vs. write is therefore a *role choice*, resolved by picking the
   right `roleId`.
3. **The RPC path accepts an internal magic-link session.** The "Invalid
   provider" restriction recorded in `lib/mycelium.ts` lives only in the
   beginners REST account endpoint
   (`rest/role_scoped/beginners/account_endpoints.rs`); the RPC dispatcher
   extracts the profile the standard way and gates on the caller's roles. No
   service account or gateway change is needed.
4. **`myceliumRpc` already exists** in `lib/mycelium.ts`. Nothing new is needed
   at the transport layer.

## Non-goals

- Creating subscription accounts (that is onboarding's job, already built).
- Inviting to a *tenant* (tenant-manager guesting is a different mycelium
  surface; this feature is subscription-scoped, matching where the UI lives).
- Email delivery or template customization — mycelium owns the invitation
  message and its lifecycle.
- Bulk / CSV invite.

---

## Requirements

### FR-1 — Invite

- **FR-1.1** From the admin screen's **Members** tab, with a subscription scope
  selected, an authorized caller can invite by email address.
- **FR-1.2** The invite form asks for: **email**, **agent**, and **access level**
  (read / write). Agent options come from `GET /api/admin/agents` (the same feed
  the other admin panels use), never a hardcoded list.
- **FR-1.3** (agent, access level) resolves to a `roleId` via
  `subscriptionsManager.guestRoles.list`, matching on the role `name`/`slug`
  equal to the agent key and the role's `permission`. An agent with no matching
  role for the chosen level is not offered.
- **FR-1.4** Submitting calls
  `subscriptionsManager.guests.guestUserToSubscriptionAccount` with
  `{tenantId, accountId: subsAccId, roleId, email}`.
- **FR-1.5** The email is validated client-side before the button enables
  (mirroring the reference `validateEmail` gate).
- **FR-1.6** Success refreshes the guest list and clears the form; failure shows
  the upstream RPC message, not a generic string.
- **FR-1.7** Re-inviting an existing guest is not an error — mycelium's endpoint
  is get-or-create; the UI reports "already invited" rather than failing.

### FR-2 — List guests

- **FR-2.1** The Members tab lists the subscription's guests via
  `subscriptionsManager.guests.listGuestOnSubscriptionAccount`, showing email,
  role (agent + permission), verification state, and invited-at.
- **FR-2.2** This list is **distinct from** the existing member list
  (`GET /v1/admin/users`, which enumerates users who have a *workspace on disk*).
  A person invited but who has never chatted appears in the guest list and not
  in the workspace list; the panel presents them as one roster with a "not yet
  active" marker rather than two confusing tables.
- **FR-2.3** Pagination follows the reference: `pageSize` / `skip`, with the
  paginated-vs-array response shape handled defensively (the reference's
  `guestRolesList` already does this for roles).

### FR-3 — Revoke

- **FR-3.1** A guest row offers **Revoke**, calling
  `subscriptionsManager.guests.revokeUserGuestToSubscriptionAccount` with
  `{tenantId, accountId, roleId, email}`.
- **FR-3.2** Revoke is behind a confirmation dialog (the webapp's existing
  `ConfirmDialog`), stating that the person loses access to that agent.
- **FR-3.3** Revoking access does **not** delete the member's workspace or
  files. The dialog says so — deleting content is a separate, deliberate action
  that already exists in the Members panel.

### FR-4 — Authorization

- **FR-4.1** The invite/revoke affordances require the caller to be at
  subscriptions-manager tier or above **on the target subscription** — the same
  authority the Members panel itself requires
  (`authz.AuthorizeUserManagement`, i.e. `CallerTier >= TierSubscription`).
- **FR-4.2** **Do not gate on `isInstanceAdmin`.** That helper is staff/manager
  only; using it would stop a subscriptions-manager from inviting to their own
  subscription — the primary use case.
- **FR-4.3** The UI gate is a convenience only. Mycelium enforces the real check
  server-side and will reject an unauthorized RPC; the BFF surfaces its status.

### FR-5 — BFF routes

- **FR-5.1** New route handlers under `app/api/invitations/`:
  - `GET  /api/invitations?tenantId=&subsAccId=` → list guests
  - `POST /api/invitations` `{tenantId, subsAccId, agent, permission, email}` → invite
  - `DELETE /api/invitations` `{tenantId, subsAccId, roleId, email}` → revoke
  - `GET  /api/invitations/roles?tenantId=` → the (agent, permission) → roleId map
- **FR-5.2** They follow the BFF invariant already stated in `lib/mycelium.ts`:
  the browser never talks to mycelium directly; the session JWT is read
  server-side from the `myc_session` cookie and never reaches the client.
- **FR-5.3** Errors normalize to the stack-wide shapes
  (`{error:"session_expired"}` / `{error:"connectivity"}` / upstream message +
  status), as `adminProxy.ts` does.

### FR-6 — i18n

- **FR-6.1** ~~All new strings go through `lib/i18n`.~~ **Dropped during
  implementation.** `lib/i18n` covers the landing page only, and its own comment
  records the reason: *"Existing chat/admin screens are not yet translated —
  retrofitting them is a separate, incremental follow-up."* Every neighbouring
  admin panel uses plain English literals, so routing only the new strings
  through the catalogue would make this panel the odd one out and would not make
  the screen translatable. The new copy follows the surrounding convention;
  translating the admin surface stays the separate follow-up it already was.

### NFR

- **NFR-1** No new npm dependency. The reference uses `react-hook-form` +
  `flowbite-react`; this webapp uses its own `components/ui` primitives, so the
  form is written against those (`FormField`-equivalent, `Alert`, `ConfirmDialog`,
  `Spinner`), matching the surrounding panels rather than importing the
  reference's stack.
- **NFR-2** The role lookup (FR-1.3) is fetched once per tenant and cached for
  the session — it changes only when the gateway config changes.

---

## Traceability

| ID | Verified by |
| --- | --- |
| FR-1.3 | Unit: role matcher picks the write role for (alpha, write); returns none when absent |
| FR-1.4 | Route test: POST maps body → RPC params exactly |
| FR-1.5 | Component test: button disabled until the email validates |
| FR-1.7 | Route test: get-or-create response surfaces "already invited" |
| FR-2.2 | Unit: guest list ∪ workspace list merges on email, marks "not yet active" |
| FR-3.1 | Route test: DELETE maps to the revoke RPC |
| FR-4.1 | Component test: affordance hidden without subscription-tier authority |
| FR-4.2 | Grep gate: `isInstanceAdmin` is not referenced by the invitation code |
| FR-5.2 | Grep gate: no `MYCELIUM_INTERNAL_URL` / token reference in a client component |
| FR-6.1 | Dropped — see the requirement |
