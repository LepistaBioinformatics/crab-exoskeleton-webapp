import { myceliumRpc } from "@/lib/mycelium";

// Server-side only. One read of the session's mycelium profile, exposing the
// three things the directory area needs from it.
//
// WHY NOT `isInstanceAdmin`. That helper answers `isStaff || isManager` as a
// single boolean, which is exactly right for branding and not enough here: the
// `userManager.account.*` transitions carry a second gate, `is_manager &&
// !is_staff`, that refuses a manager acting on a privileged target. A console
// that cannot tell the two tiers apart cannot explain that refusal. It is left
// untouched rather than widened -- it gates a shipped authorization path, and
// changing its shape to serve a new caller is how that path acquires a bug.
//
// WHY `userId` AT ALL. `managers.tenants.create` takes an `ownerId`, and the
// tenant it creates is editable only by its owners -- `with_tenant_ownership_or_error`
// is the one guard in the gateway with no staff bypass. So creating a tenant
// without naming the creator as owner produces a tenant the creator cannot
// rename, archive or verify. The id has to be the USER's, not the account's:
// `create_tenant` resolves it with `get_user_by_id`, and `Owner::from_user`
// builds each entry of `profile.owners` from `user.id`. `acc_id` would be
// accepted by the type and refused by the lookup.
export interface CallerProfile {
  isStaff: boolean;
  isManager: boolean;
  /** The caller's own USER id, for `ownerId`. Null when the profile carries no owner. */
  userId: string | null;
}

export interface ProfileOwner {
  id?: unknown;
  isPrincipal?: unknown;
}

interface ProfileResult {
  isStaff?: boolean;
  isManager?: boolean;
  owners?: ProfileOwner[];
}

// The principal owner's id, falling back to the first owner with one.
//
// A profile can carry several owners; the principal is the one that administrates
// it, and picking any other would name a different person as the tenant's owner.
// Falling back to the first is still better than failing: a single-owner profile
// does not always set the flag, and every owner of a profile is the caller.
export function principalUserId(owners: ProfileOwner[] | undefined): string | null {
  if (!Array.isArray(owners)) return null;
  const usable = owners.filter(
    (o) => typeof o?.id === "string" && (o.id as string).trim(),
  );
  const principal = usable.find((o) => o.isPrincipal === true);
  const chosen = principal ?? usable[0];
  return chosen ? (chosen.id as string) : null;
}

export async function callerProfile(token: string): Promise<CallerProfile | null> {
  const rpc = await myceliumRpc<ProfileResult>("beginners.profile.get", {}, token);
  if (!rpc.ok) return null;
  const result = rpc.result;
  return {
    isStaff: result?.isStaff === true,
    isManager: result?.isManager === true,
    userId: principalUserId(result?.owners),
  };
}

// Whether this caller may use the directory at all. Staff or manager, matching
// every `managers.*` guard, which is `has_admin_privileges_or_error`.
export function canManageDirectory(profile: CallerProfile | null): boolean {
  return !!profile && (profile.isStaff || profile.isManager);
}
