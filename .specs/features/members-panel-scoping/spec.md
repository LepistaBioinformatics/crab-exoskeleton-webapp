# members-panel-scoping — Specification

**Status:** Implemented · **Size:** Medium (one panel, one form, one pure helper)

## Problem

Three things in the members panel contradict the selection the whole admin screen is built
around, and one reported problem turned out not to exist.

**Roles from every agent on every row.** The roster is the subscription's, and a guest role's
name IS the agent key — so a person guested on `alpha`, `beta` and `hermes-glm` shows three
badges regardless of which agent the admin selected. The panel sits inside a chosen agent
and then reports facts about the others.

**Two ways to remove access, one of them hidden in a form.** `InviteMember` carries an
Invite/Uninvite switch that takes an email, an agent and a level; the roster row carries a
revoke button per grant. The switch asks the admin to retype what the row already knows,
and the two can disagree about what is being removed.

**A destructive control on a collapsed row.** The revoke button sits in the always-visible
badge strip, one mis-tap from a person's access — beside a chevron whose whole job is to be
tapped.

**Not a defect:** the roster is already sorted by email (`mergeRoster`, `lib/invitations.ts`).
Verified: `ana@… | Bruno@… | carla@… | Zeca@…`.

## Requirements

- **FR-1** A roster row shows only the grants for the SELECTED agent. A member with none on
  it stays listed — they are a member of the subscription either way — and simply carries no
  badge.
- **FR-1.1** The filter is a pure function over `RoleGrant[]`, tested. It applies to grants
  from both feeds: the guest rows and the workspace rows, which both carry `agentKey`.
- **FR-2** `InviteMember` invites only. The action switch, the uninvite branch of `submit`,
  its confirmation and its copy are removed. `revokeMember` stays in the panel, which is now
  its only caller.
- **FR-3** The revoke control is only reachable from the EXPANDED row — the box the admin
  opens by clicking the person's name. Nothing destructive sits on a collapsed row.
- **FR-3.1** In the expanded box it names what it revokes: the agent and the level. Its
  existing confirmation is unchanged, including the line saying the member's workspace and
  files are kept.
- **FR-3.2** A member with no `accId` cannot expand — there is no workspace behind them —
  so an invited-but-never-active person's grant is revoked from… nothing. That row must
  therefore stay expandable ON ITS GRANTS ALONE, or the invitation becomes unrevokable.
- **FR-4** The roster's sort is made explicit rather than incidental: compared with an
  explicit locale and `sensitivity: "base"`, so the order cannot differ between the server's
  ICU default and the browser's.
- **FR-5** Copy orphaned by FR-2 is deleted from both locales.

## Out of scope

The instances section, the private-file rules (FR-7 privacy stands unchanged: metadata
only, no path to bytes), and the invite confirmation naming tenant › subscription › agent ›
level, which stays as `backoffice-admin-shell` left it.

## Verification

`npx tsc --noEmit` (baseline 5), `npx vitest run`, `yarn build`. Then the user's walk: a
member guested on two agents shows one badge; the invite form has no uninvite; revoking is
reachable only after opening a row.

---

## Amendment — filtering, and the pagination it depends on (same session)

The user asked for a member filter, and asked two questions worth answering before building
it: is the screen paginated, and does it come from mycelium.

**It comes from TWO feeds.** Who was INVITED is mycelium, over JSON-RPC
(`subscriptionsManager.guests.listGuestOnSubscriptionAccount`). Who has actually USED the
agent is crab-shell-proxy, enumerated from disk (`listSubscriptionUsers` → `/api/admin/users`
→ the proxy's `/users`). `mergeRoster` merges them into one list.

**And yes, the mycelium half is paginated — and was being truncated silently.**
`app/api/invitations/route.ts` unwrapped the envelope's `records` and dropped its `count`,
passing no `pageSize`. The sibling roles route already guards exactly this, with a comment
saying mycelium defaults it to TEN. This response is one row **per grant**, not per person,
so a subscription with four or five members guested on two agents each already reaches it.
Measured against the live database at the time: 7 grants / 4 people on the largest
subscription — under the limit, and a handful of invitations from silently hiding people.

- **FR-6** The guest list requests an explicit `pageSize` (500, the ceiling the roles route
  already uses) and compares the envelope's `count` against what came back.
- **FR-6.1** When it still does not fit, the response carries `truncated: true` and the
  panel says so. A partial roster is worse than an error on the one screen whose job is to
  say who has access: it reads as people who were never invited.
- **FR-6.2** `count` is read only from an envelope. A bare array carries no claim about a
  total and must not be treated as one.
- **FR-7** The filter is client-side over the merged roster, which is honest ONLY because of
  FR-6 — filtering a silently truncated list would answer "nobody matches" about people the
  screen never had.
- **FR-7.1** It matches the address and the grant labels, case-insensitively; the label is
  how an agent appears in this list.
- **FR-7.2** Offered whenever the roster has anyone in it. It shipped gated on "more than
  five rows" — and the subscriptions this runs against hold three and four people, so the
  control was never drawn. The general reasoning (a filter over three rows costs more
  attention than it saves) was sound and irrelevant: it hid the feature at the exact scale
  it ships to.
- **FR-7.3** A filter matching nothing says so, distinctly from a subscription with no
  members at all.
