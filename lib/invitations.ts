import type { UserRef } from "@/lib/admin";

// Inviting someone to a subscription is mycelium's `guest` machinery, reached
// over the same JSON-RPC endpoint the onboarding flow already uses. The webapp
// stores no invitation state of its own.
//
// Two facts make the mapping work, both verified against the stack rather than
// assumed:
//
//  1. A guest role's NAME is the agent key. The gateway config declares
//     `protectedByRoles = [{ name = "alpha", permission = "write" }]`, and
//     mycelium auto-creates declared roles at boot, so "invite to agent alpha"
//     is literally "guest with the role named alpha".
//  2. The permission lives on the ROLE, not on the guesting call --
//     `guestUserToSubscriptionAccount` takes only {tenantId, accountId, roleId,
//     email}. Read vs. write is therefore a choice of WHICH role id to send.

export type AccessLevel = "read" | "write";

export interface GuestRole {
  id?: string | null;
  name: string;
  slug: string;
  permission: number | string;
  system?: boolean;
}

// Mycelium serializes an Email as a STRUCTURED OBJECT ({username, domain}), not
// a plain string — the same trap app/api/auth/verify/route.ts already documents
// for the magic-link response: "the reference mycelium-webapp's own TS types
// call it a string, which doesn't match what the server actually sends".
// Accept both, and never touch the raw value directly.
export type MyceliumEmail = string | { username?: string; domain?: string };

export interface GuestUser {
  id?: string | null;
  email: MyceliumEmail;
  guestRole?: { id?: string | null; name?: string } | string | null;
  created?: string;
  wasVerified?: boolean;
}

// emailText renders either shape as the address a human reads. An unusable
// value becomes "" rather than throwing: one malformed guest row must not take
// down the whole Members screen.
export function emailText(email: MyceliumEmail | undefined | null): string {
  if (typeof email === "string") return email;
  if (email && typeof email === "object") {
    const { username, domain } = email;
    if (username && domain) return `${username}@${domain}`;
  }
  return "";
}

// Mycelium reports a permission as either a number (Read = 0, Write = 1 in the
// gateway's Permission enum, guest_role.rs) or its string form, depending on the
// endpoint's serializer. Normalize both rather than betting on one.
//
// Matched exactly, never by substring: "overwrite" contains "write" and "thread"
// contains "read", and silently reading either as a grant would hand out the
// wrong access level. An unrecognized value is null, which the callers treat as
// "this level cannot be granted" — the safe direction.
export function permissionLevel(permission: number | string): AccessLevel | null {
  if (typeof permission === "number") {
    if (permission === 0) return "read";
    if (permission === 1) return "write";
    return null;
  }
  const v = permission.trim().toLowerCase();
  return v === "read" || v === "write" ? v : null;
}

// Picks the role id for (agent, access level). Returns null when the tenant has
// no such role — which is a real state, not an error: a gateway config that
// never declared a write path for an agent has no write role to grant.
export function resolveRoleId(
  roles: GuestRole[],
  agentKey: string,
  level: AccessLevel,
): string | null {
  const match = roles.find(
    (r) =>
      r.id &&
      (r.name === agentKey || r.slug === agentKey) &&
      permissionLevel(r.permission) === level,
  );
  return match?.id ?? null;
}

// The access levels actually grantable for an agent, so the form offers only
// what the gateway declared.
export function availableLevels(roles: GuestRole[], agentKey: string): AccessLevel[] {
  return (["read", "write"] as AccessLevel[]).filter(
    (level) => resolveRoleId(roles, agentKey, level) !== null,
  );
}

export interface RosterEntry {
  email: string;
  // Whether mycelium has verified the invitation. An unverified guest has been
  // invited but has not accepted, which is a different state from "invited and
  // never used the agent" (see `active`).
  verified?: boolean;
  // The agent roles this person is guested with, e.g. ["alpha (write)"].
  roles: string[];
  // True once they have a workspace on disk — i.e. they have actually used the
  // agent. A guest who has never chatted is invited but not yet active.
  active: boolean;
  accId?: string;
  invitedAt?: string;
}

function roleLabel(guest: GuestUser, roles: GuestRole[]): string {
  const gr = guest.guestRole;
  const rawId = typeof gr === "string" ? gr : gr?.id;
  const id = typeof rawId === "string" && rawId ? rawId : null;
  const named = typeof gr === "object" && gr?.name ? gr.name : undefined;
  // Only look up a real id. Matching on a missing one would pair this guest with
  // the first role that also has no id — an unrelated agent and permission.
  const found = id ? roles.find((r) => r.id === id) : undefined;
  const name = found?.name ?? named ?? "unknown";
  const level = found ? permissionLevel(found.permission) : null;
  return level ? `${name} (${level})` : name;
}

// One roster from two feeds that answer different questions: the guest list is
// "who was invited" (mycelium), the workspace list is "who has actually used it"
// (the proxy, from disk). Presenting them as two tables would make a normal
// state — invited, not yet signed in — look like an inconsistency.
//
// Matched on email, lowercased: mycelium keys guests by email, while the proxy
// records it only as traceability next to the account id.
export function mergeRoster(guests: GuestUser[], users: UserRef[], roles: GuestRole[]): RosterEntry[] {
  const byEmail = new Map<string, RosterEntry>();

  for (const g of guests) {
    const address = emailText(g.email);
    // A row we cannot name cannot be matched, shown or revoked; skipping it
    // keeps the rest of the roster usable.
    if (!address) continue;
    const key = address.toLowerCase();
    const entry = byEmail.get(key) ?? { email: address, roles: [], active: false };
    const label = roleLabel(g, roles);
    if (!entry.roles.includes(label)) entry.roles.push(label);
    if (g.created && !entry.invitedAt) entry.invitedAt = g.created;
    // Any verified grant makes the person verified; several rows for one email
    // are separate role grants, not separate people.
    if (g.wasVerified) entry.verified = true;
    else if (entry.verified === undefined) entry.verified = false;
    byEmail.set(key, entry);
  }

  for (const u of users) {
    // A workspace with no recorded email cannot be matched to a guest row; show
    // it on its own rather than dropping it.
    const key = (u.email ?? "").toLowerCase();
    const existing = key ? byEmail.get(key) : undefined;
    const entry = existing ?? {
      email: u.email || u.accId,
      roles: [],
      active: false,
    };
    entry.active = true;
    entry.accId = u.accId;
    const role = u.role;
    if (role && !entry.roles.some((r) => r.startsWith(role))) entry.roles.push(role);
    byEmail.set(key || u.accId, entry);
  }

  return [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
}

// --- client calls (all through the BFF; the session JWT never reaches here) ---

export async function listGuestRoles(tenantId: string): Promise<GuestRole[]> {
  const res = await fetch(`/api/invitations/roles?tenantId=${encodeURIComponent(tenantId)}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.roles) ? (data.roles as GuestRole[]) : [];
}

export async function listGuests(tenantId: string, subsAccId: string): Promise<GuestUser[]> {
  const q = new URLSearchParams({ tenantId, subsAccId });
  const res = await fetch(`/api/invitations?${q.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.guests) ? (data.guests as GuestUser[]) : [];
}

export async function inviteMember(input: {
  tenantId: string;
  subsAccId: string;
  roleId: string;
  email: string;
}): Promise<{ alreadyInvited: boolean }> {
  const res = await fetch("/api/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json().catch(() => ({}));
  return { alreadyInvited: data?.alreadyInvited === true };
}

export async function revokeMember(input: {
  tenantId: string;
  subsAccId: string;
  roleId: string;
  email: string;
}): Promise<void> {
  const q = new URLSearchParams(input);
  const res = await fetch(`/api/invitations?${q.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res));
}

async function errorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  const e = data?.error;
  if (e === "connectivity") return "Can't reach the gateway right now.";
  if (e === "session_expired") return "Your session expired — sign in again.";
  if (typeof e === "string" && e.trim()) return e;
  return "Something went wrong.";
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}
