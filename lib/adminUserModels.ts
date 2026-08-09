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

// One level's policy, without inheritance. `null` on a field means "unset here",
// which is a third state the screen has to render: it is what makes "inherits
// from above" distinguishable from "deliberately allowed here".
export interface ModelPolicy {
  /** May members here run a model of their own? Unset ⇒ yes. */
  userModels: boolean | null;
  /** May they name an endpoint the catalog does not carry? Unset ⇒ no. */
  customEndpoint: boolean | null;
}

export const UNSET_POLICY: ModelPolicy = { userModels: null, customEndpoint: null };

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
  const read = (v: unknown) => (typeof v === "boolean" ? v : null);
  if (!p) return UNSET_POLICY;
  return { userModels: read(p.allow_user_models), customEndpoint: read(p.allow_custom_endpoint) };
}

// A PATCH of one field. The two switches are set from separate controls, and the
// proxy leaves an omitted field alone — so this must send only what changed, or
// touching one control would silently reset the other.
export async function setModelPolicy(
  agent: Instance,
  scope: ScopeRef,
  patch: { userModels?: boolean; customEndpoint?: boolean },
): Promise<void> {
  const body: Record<string, boolean> = {};
  if (patch.userModels !== undefined) body.allow_user_models = patch.userModels;
  if (patch.customEndpoint !== undefined) body.allow_custom_endpoint = patch.customEndpoint;
  const res = await fetch(`/api/admin/model-policy?${policyQuery(agent, scope)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorCode(res));
}

// Releases ONE switch back to inheritance. Named, never blanket: the level holds
// two decisions and letting one inherit must not lift the other.
export async function clearModelPolicy(
  agent: Instance,
  scope: ScopeRef,
  field: "user_models" | "custom_endpoint",
): Promise<void> {
  const query = `${policyQuery(agent, scope)}&field=${field}`;
  const res = await fetch(`/api/admin/model-policy?${query}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorCode(res));
}

// The three states of the control, as one value the panel renders rather than a
// boolean plus a null check at every use.
export type PolicyChoice = "inherit" | "allow" | "block";

export function policyChoice(v: boolean | null): PolicyChoice {
  if (v === null) return "inherit";
  return v ? "allow" : "block";
}
