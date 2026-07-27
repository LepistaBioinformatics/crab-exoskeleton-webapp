# subscription-invitations — Tasks

From [spec.md](spec.md). Design is inline (Medium scope): no new architecture,
one new BFF route group and one panel section.

Gate check for every task: `yarn lint && yarn test` (and `yarn build` before the
final task).

---

### T-01 — Role resolution helper
- **What:** `lib/invitations.ts` — types (`GuestRole`, `GuestUser`,
  `InviteInput`), plus `resolveRoleId(roles, agentKey, permission)` matching a
  role whose `name`/`slug` equals the agent key and whose `permission` matches
  the requested level.
- **Why a pure helper first:** FR-1.3 is the one piece of real logic in this
  feature; keeping it out of a component makes it testable without a DOM.
- **Depends on:** —
- **Done when:** returns the write role for `(alpha, write)`, the read role for
  `(alpha, read)`, and `null` when the tenant has no such role.
- **Tests:** table test including a tenant whose config declares only the read
  role.

### T-02 — BFF: roles feed
- **What:** `GET /api/invitations/roles?tenantId=` → `subscriptionsManager.guestRoles.list`
  via `myceliumRpc`, handling both the array and paginated response shapes.
- **Where:** `app/api/invitations/roles/route.ts`
- **Depends on:** T-01
- **Reuses:** `myceliumRpc`, `requireSession` — the session token is read
  server-side and never returned to the client (FR-5.2).
- **Tests:** route test for both response shapes; 401 without a session.

### T-03 — BFF: list / invite / revoke
- **What:** `app/api/invitations/route.ts` with GET, POST, DELETE mapping to
  `guests.listGuestOnSubscriptionAccount`,
  `guests.guestUserToSubscriptionAccount`,
  `guests.revokeUserGuestToSubscriptionAccount`.
- **Depends on:** T-02
- **Done when:** FR-5.1 and FR-5.3 hold; a get-or-create response is
  distinguishable so the UI can say "already invited" (FR-1.7).
- **Tests:** one per verb, asserting the exact RPC method name and param shape.

### T-04 — Roster merge
- **What:** merge the guest list (FR-2.1) with the existing workspace member
  list (`listSubscriptionUsers`) on email into one roster, marking guests with no
  workspace as "not yet active" (FR-2.2).
- **Where:** `lib/invitations.ts`
- **Depends on:** T-01
- **Done when:** a person in both lists appears once; a guest-only person is
  marked; a workspace-only person (invited outside the UI, or whose guest row
  was revoked) still appears.
- **Tests:** unit over the three cases.

### T-05 — Invite form
- **What:** `app/admin/invite-member.tsx` — email input, agent select (from
  `GET /api/admin/agents`), access-level select, submit.
- **Depends on:** T-03, T-04
- **Reuses:** the webapp's own `components/ui` primitives (`Alert`,
  `Spinner`, `IconButton`, the `field.tsx` pattern) — **not** the reference's
  `flowbite-react` / `react-hook-form` stack (NFR-1). Copy the mycelium
  *strategy*, not its component library.
- **Done when:** FR-1.1–1.7 hold; the button enables only on a valid email plus
  a resolvable role.
- **Tests:** component tests for the disabled gate and the error surface.

### T-06 — Roster + revoke in the Members panel
- **What:** render the merged roster, add the Revoke action behind
  `ConfirmDialog`, wording per FR-3.3 (access is revoked; files are not deleted).
- **Where:** `app/admin/members-panel.tsx`
- **Depends on:** T-05
- **Careful:** this panel carries a hard privacy invariant (FR-7 of
  admin-shared-content) — it must expose **no** way to open, download or preview
  a member's private file. Do not add a link or row click handler while editing
  it.
- **Tests:** revoke calls the DELETE route with the right role id; the privacy
  invariant assertion in the existing tests stays green.

### T-07 — Authorization gate
- **What:** show invite/revoke only at subscriptions-manager tier or above on
  the selected subscription (FR-4.1).
- **Depends on:** T-06
- **Explicitly:** do **not** use `isInstanceAdmin` (FR-4.2) — it is staff/manager
  only and would lock out the main user of this feature.
- **Reuses:** `canManageWorkspaceScope` in `lib/admin.ts` if it already answers
  this; otherwise extend it rather than adding a parallel check.
- **Tests:** affordance hidden for a non-manager.

### T-08 — i18n — DROPPED
`lib/i18n` covers the landing page only; every neighbouring admin panel uses
plain English literals by an explicit, documented decision. See FR-6.1 in
spec.md for the reasoning. The new copy matches the surrounding convention.

### T-09 — Manual UAT
Invite a fresh email to a subscription with agent `alpha` + write; confirm the
guest appears as "not yet active", that the invitee can sign in and reach that
agent, that they then appear as active, and that revoking removes access without
touching their files.
