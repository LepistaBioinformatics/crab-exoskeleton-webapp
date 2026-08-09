import { errorCode } from "@/lib/i18n/errors";
import type { Instance } from "@/lib/mycelium";
import type { ScopeRef } from "@/lib/admin";
import type { UserModel } from "@/lib/userModels";

// The administrator's view of user-owned-models: what members registered under a
// subscription, and whether personal models are allowed in a scope at all.
//
// Read plus a switch. There is deliberately no edit: an administrator does not
// change somebody else's model definition, and no response here carries a key.

// One member's model, tagged with the agent whose roster it was found under.
export interface AdminUserModel extends UserModel {
  agent: string;
}

export async function listAdminUserModels(
  agent: Instance,
  tenantId: string,
  subsAccId: string,
): Promise<AdminUserModel[]> {
  const q = new URLSearchParams({ agent, tenant_id: tenantId, subs_acc_id: subsAccId });
  const res = await fetch(`/api/admin/user-models?${q.toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  return Array.isArray(data.models) ? (data.models as AdminUserModel[]) : [];
}

export async function setAdminUserModelEnabled(
  agent: Instance,
  tenantId: string,
  subsAccId: string,
  model: AdminUserModel,
  enabled: boolean,
): Promise<void> {
  const res = await fetch("/api/admin/user-models", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent,
      tenant_id: tenantId,
      subs_acc_id: subsAccId,
      owner_acc_id: model.owner_acc_id,
      slug: model.slug,
      enabled,
    }),
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

// The lock at ONE level, without inheritance. null means "unset here", which is
// a third state the screen has to render: it is what makes "inherits from above"
// distinguishable from "deliberately allowed here".
export type ModelPolicy = boolean | null;

function policyQuery(agent: Instance, scope: ScopeRef): string {
  const q = new URLSearchParams({ agent, scope: scope.kind, tenant_id: scope.tenantId });
  if (scope.kind === "subscription" && scope.subsAccId) q.set("subs_acc_id", scope.subsAccId);
  return q.toString();
}

export async function getModelPolicy(agent: Instance, scope: ScopeRef): Promise<ModelPolicy> {
  const res = await fetch(`/api/admin/model-policy?${policyQuery(agent, scope)}`);
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  const p = data?.policy;
  if (!p || typeof p.allow_user_models !== "boolean") return null;
  return p.allow_user_models;
}

export async function setModelPolicy(
  agent: Instance,
  scope: ScopeRef,
  allow: boolean,
): Promise<void> {
  const res = await fetch(`/api/admin/model-policy?${policyQuery(agent, scope)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allow_user_models: allow }),
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

export async function clearModelPolicy(agent: Instance, scope: ScopeRef): Promise<void> {
  const res = await fetch(`/api/admin/model-policy?${policyQuery(agent, scope)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

// The three states of the control, as one value the panel renders rather than a
// boolean plus a null check at every use.
export type PolicyChoice = "inherit" | "allow" | "block";

export function policyChoice(p: ModelPolicy): PolicyChoice {
  if (p === null) return "inherit";
  return p ? "allow" : "block";
}
