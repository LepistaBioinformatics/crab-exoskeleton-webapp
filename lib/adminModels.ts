import type { ScopeRef } from "@/lib/admin";

// Model-override client API (admin-model-override). Every shape here carries
// only {provider, name} -- an API key never transits this API or reaches the
// client (CTX-AMO-06). Mirrors lib/adminSkills.ts's structure.

export interface SelectableModel {
  provider: string;
  name: string;
}

// The effective model at a scope/user target, plus which level actually set
// it (may be a scope above the one queried, e.g. "tenant" when a subscription
// has no override of its own).
export interface ModelOverride {
  provider: string;
  name: string;
  level: "tenant" | "subscription" | "user" | "default";
}

export interface UserModel {
  accId: string;
  email?: string;
  provider: string;
  name: string;
  level: string;
}

// Same scope->query-params shape as lib/admin.ts's (unexported) scopeParams --
// replicated here rather than exported from lib/admin.ts. `userAccId` adds the
// per-user target used by the per-user override calls.
function scopeParams(scope: ScopeRef, userAccId?: string): URLSearchParams {
  const q = new URLSearchParams({ scope: scope.kind, tenant_id: scope.tenantId });
  if (scope.kind === "subscription" && scope.subsAccId) q.set("subs_acc_id", scope.subsAccId);
  if (userAccId) q.set("user_acc_id", userAccId);
  return q;
}

export async function listSelectableModels(): Promise<SelectableModel[]> {
  const res = await fetch("/api/admin/models");
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.models) ? (data.models as SelectableModel[]) : [];
}

export async function getModelOverride(scope: ScopeRef, userAccId?: string): Promise<ModelOverride> {
  const res = await fetch(`/api/admin/model?${scopeParams(scope, userAccId).toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  return res.json();
}

export async function setModelOverride(
  scope: ScopeRef,
  sel: SelectableModel,
  userAccId?: string,
): Promise<void> {
  const res = await fetch("/api/admin/model", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: scope.kind,
      tenant_id: scope.tenantId,
      subs_acc_id: scope.subsAccId,
      user_acc_id: userAccId,
      provider: sel.provider,
      name: sel.name,
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function clearModelOverride(scope: ScopeRef, userAccId?: string): Promise<void> {
  const res = await fetch(`/api/admin/model?${scopeParams(scope, userAccId).toString()}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function listUserModels(scope: ScopeRef): Promise<UserModel[]> {
  const res = await fetch(`/api/admin/model/users?${scopeParams(scope).toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.users) ? (data.users as UserModel[]) : [];
}

async function errorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  const e = data?.error;
  if (e === "connectivity") return "Can't reach the gateway right now.";
  if (e === "session_expired") return "Your session expired — sign in again.";
  if (typeof e === "string" && e.trim()) return e;
  if (res.status === 413) return "File is too large.";
  return "Something went wrong.";
}
