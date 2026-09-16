import { errorCode } from "@/lib/i18n/errors";
import type { TenantRow } from "@/lib/tenantShape";

// The client side of the directory. Every call goes to this app's own BFF; the
// session JWT never reaches the browser, so nothing here carries a token.
//
// Each function throws `new Error(await errorCode(res))` on failure, which is the
// house contract: the panel catches and renders through `errorText`, so an
// unrecognised code becomes the generic copy rather than raw prose from upstream.

export type { TenantRow };

export interface SubscriptionAccountRow {
  id: string;
  name: string;
  isActive?: boolean;
  isChecked?: boolean;
  isArchived?: boolean;
}

export interface GuestRoleRow {
  id: string;
  name: string;
  description?: string | null;
  /** 0 read, 1 write -- or the string form, depending on the endpoint. */
  permission: number | string;
  system?: boolean;
}

async function fail(res: Response): Promise<never> {
  throw new Error(await errorCode(res));
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) await fail(res);
  return (await res.json()) as T;
}

// --- identity ---------------------------------------------------------------

export interface DirectoryAuthority {
  isStaff: boolean;
  isManager: boolean;
}

export async function fetchDirectoryAuthority(): Promise<DirectoryAuthority> {
  const res = await fetch("/api/admin/identity");
  if (!res.ok) return { isStaff: false, isManager: false };
  const data = await res.json().catch(() => null);
  return { isStaff: data?.isStaff === true, isManager: data?.isManager === true };
}

// --- tenants ----------------------------------------------------------------

export async function listTenants(
  term?: string,
): Promise<{ tenants: TenantRow[]; truncated: boolean }> {
  const q = new URLSearchParams();
  if (term?.trim()) q.set("term", term.trim());
  const data = await json<{ tenants: TenantRow[]; truncated?: boolean }>(
    await fetch(`/api/admin/tenants?${q.toString()}`),
  );
  return { tenants: data.tenants ?? [], truncated: data.truncated === true };
}

export async function createTenant(input: {
  name: string;
  description?: string;
}): Promise<void> {
  await json(
    await fetch("/api/admin/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export type TenantAction = "rename" | "archive";

export async function updateTenant(
  id: string,
  body: { action: TenantAction; name?: string; description?: string },
): Promise<void> {
  await json(
    await fetch(`/api/admin/tenants/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteTenant(id: string): Promise<void> {
  const res = await fetch(`/api/admin/tenants/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) await fail(res);
}

// The whole meta map goes every time: a tag write REPLACES it, so sending only
// the logo would delete the colour. The caller passes what it read back plus its
// change, and this is the one place that rule can be stated for every caller.
export async function saveTenantBrand(
  id: string,
  input: { tagId: string | null; meta: Record<string, string> },
): Promise<void> {
  await json(
    await fetch(`/api/admin/tenants/${encodeURIComponent(id)}/brand`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

// --- subscription accounts --------------------------------------------------

export async function listSubscriptionAccounts(
  tenantId: string,
  term?: string,
): Promise<{ accounts: SubscriptionAccountRow[]; truncated: boolean }> {
  const q = new URLSearchParams({ tenantId });
  if (term?.trim()) q.set("term", term.trim());
  const data = await json<{ accounts: unknown[]; truncated?: boolean }>(
    await fetch(`/api/admin/subscription-accounts?${q.toString()}`),
  );
  return {
    accounts: (data.accounts ?? []).flatMap(accountRow),
    truncated: data.truncated === true,
  };
}

// `Account.id` is Option<Uuid> on the wire, so a row can arrive without one. It
// is dropped rather than rendered: every control on it would fail.
function accountRow(raw: unknown): SubscriptionAccountRow[] {
  if (!raw || typeof raw !== "object") return [];
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "string" || typeof a.name !== "string") return [];
  return [
    {
      id: a.id,
      name: a.name,
      isActive: a.isActive === true,
      isChecked: a.isChecked === true,
      isArchived: a.isArchived === true,
    },
  ];
}

export async function createSubscriptionAccount(input: {
  tenantId: string;
  name: string;
}): Promise<void> {
  await json(
    await fetch("/api/admin/subscription-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

// Rename only. The status transitions were removed with their controls -- see the
// route for why the endpoint went with the buttons.
export type AccountAction = "rename";

export async function updateSubscriptionAccount(
  id: string,
  body: { action: AccountAction; tenantId: string; name: string },
): Promise<void> {
  await json(
    await fetch(`/api/admin/subscription-accounts/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

export async function deleteSubscriptionAccount(
  id: string,
  tenantId: string,
): Promise<void> {
  const q = new URLSearchParams({ tenantId });
  const res = await fetch(
    `/api/admin/subscription-accounts/${encodeURIComponent(id)}?${q.toString()}`,
    { method: "DELETE" },
  );
  if (!res.ok) await fail(res);
}

// --- guest roles ------------------------------------------------------------

export async function listGuestRoles(
  term?: string,
): Promise<{ roles: GuestRoleRow[]; truncated: boolean }> {
  const q = new URLSearchParams();
  if (term?.trim()) q.set("term", term.trim());
  const data = await json<{ roles: unknown[]; truncated?: boolean }>(
    await fetch(`/api/admin/guest-roles?${q.toString()}`),
  );
  return {
    roles: (data.roles ?? []).flatMap(guestRoleRow),
    truncated: data.truncated === true,
  };
}

function guestRoleRow(raw: unknown): GuestRoleRow[] {
  if (!raw || typeof raw !== "object") return [];
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return [];
  const permission = r.permission;
  if (typeof permission !== "number" && typeof permission !== "string") return [];
  return [
    {
      id: r.id,
      name: r.name,
      description: typeof r.description === "string" ? r.description : null,
      permission,
      system: r.system === true,
    },
  ];
}
