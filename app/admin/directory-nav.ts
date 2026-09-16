// THE DIRECTORY'S OWN NAVIGATION MODEL — which area is open, which tenant, which
// section of it — kept React-free and beside its truth table, for the same reason
// `admin-nav.ts` and `columns.ts` are: this screen has been rebuilt twice around
// navigation state that lived inside a component, and it does not go back.
//
// WHY ITS OWN PARAMETERS RATHER THAN `?tenant=` AND `?scope=`. Those belong to the
// workspaces chain and resolve against `AdminScope[]` — the tenants the caller can
// ADMINISTER CONTENT IN. The directory resolves against the tenants that exist,
// which is a different list and a different question. Sharing a parameter between
// two resolvers is how the two drift, and the drift would show up as a column
// drawn for a selection the other side made.

/** The two things the directory manages. Guest roles are global in mycelium —
 *  `guestManager.guestRoles.list` takes no tenant at all — so they are a sibling
 *  of the tenant list, never a section inside a tenant. */
export type DirectoryArea = "tenants" | "roles";

/** The sections of one tenant. */
export type DirectorySection = "overview" | "accounts";

export const DIRECTORY_AREAS: DirectoryArea[] = ["tenants", "roles"];
export const DIRECTORY_SECTIONS: DirectorySection[] = ["overview", "accounts"];

// A tenant as the directory columns need it: an id and something to show.
export interface DirectoryTenantRef {
  id: string;
  name: string;
}

// `?dir=` — which area. Null for absent or unrecognised, which leaves the area
// column asking rather than answering with a guess.
export function resolveArea(raw: string | null | undefined): DirectoryArea | null {
  return DIRECTORY_AREAS.includes(raw as DirectoryArea) ? (raw as DirectoryArea) : null;
}

// `?dirTenant=` — RESOLVED AGAINST THE TENANTS THAT CAME BACK, not merely parsed.
//
// The query string is user-editable and outlives a tenant that was deleted between
// visits, so a value that looks perfectly well-formed can still name nothing. Null
// then, and the column simply keeps asking — never a panel whose header names a
// tenant the caller cannot act on. Same rule and same reason as `resolveScope`.
export function resolveDirTenant(
  raw: string | null | undefined,
  tenants: DirectoryTenantRef[],
): string | null {
  if (!raw) return null;
  return tenants.some((t) => t.id === raw) ? raw : null;
}

// `?dirTab=` — which section of the selected tenant.
//
// Unlike `parseTab`, an unrecognised value yields NULL rather than a default. A
// default here would open a panel nobody asked for, which is the exact bug the
// workspaces side documents in its own `section` derivation.
export function resolveDirSection(
  raw: string | null | undefined,
): DirectorySection | null {
  return DIRECTORY_SECTIONS.includes(raw as DirectorySection)
    ? (raw as DirectorySection)
    : null;
}

// WHICH PANEL the directory shows, or null while a column is still asking.
//
// One function rather than a boolean plus a chain of ternaries in the screen: the
// panel does not need to know THAT there is something to show, it needs to know
// WHICH thing, and answering the weaker question elsewhere means writing the real
// one twice. Three copies of a condition is how they stop agreeing.
//
// The middle case is the one that is easy to get wrong:
//
//   roles    -- global in mycelium, so choosing the area is the whole path.
//   create   -- the tenants area with NOTHING selected. Still a panel, carrying the
//               create form. Without it the one screen that lists tenants would have
//               no way to add one, and an install with zero tenants could never get
//               its first.
//   tenant /
//   accounts -- a tenant is chosen, and the section says which of its panels.
//   null     -- a tenant is chosen but no section yet; the sections column is asking.
export type DirectoryPanel = "roles" | "create" | "tenant" | "accounts";

export function directoryPanel(
  area: DirectoryArea | null,
  tenantId: string | null,
  section: DirectorySection | null,
): DirectoryPanel | null {
  if (area === "roles") return "roles";
  if (area !== "tenants") return null;
  if (!tenantId) return "create";
  if (section === "accounts") return "accounts";
  if (section === "overview") return "tenant";
  return null;
}
