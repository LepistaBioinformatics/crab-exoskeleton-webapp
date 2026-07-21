import type { Instance } from "@/lib/mycelium";

// A model registered (per agent) by an admin: full picoclaw definition; the key
// is never returned (only `has_key`).
export interface RegisteredModel {
  provider: string;
  name: string;
  model: string;
  api_base: string;
  has_key: boolean;
}

export async function listRegisteredModels(agent: Instance): Promise<RegisteredModel[]> {
  const res = await fetch(`/api/admin/registered-models?agent=${encodeURIComponent(agent)}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.models) ? (data.models as RegisteredModel[]) : [];
}

export async function registerModel(
  agent: Instance,
  input: { provider: string; name: string; model: string; api_base: string; api_key: string },
): Promise<void> {
  const res = await fetch("/api/admin/registered-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent, ...input }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function deleteRegisteredModel(
  agent: Instance,
  provider: string,
  name: string,
): Promise<void> {
  const q = new URLSearchParams({ agent, provider, name });
  const res = await fetch(`/api/admin/registered-models?${q.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function applyRegisteredModel(
  agent: Instance,
  input: { tenantId: string; subsAccId: string; userAccId: string; provider: string; name: string },
): Promise<void> {
  const res = await fetch("/api/admin/registered-models/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent,
      tenant_id: input.tenantId,
      subs_acc_id: input.subsAccId,
      user_acc_id: input.userAccId,
      provider: input.provider,
      name: input.name,
    }),
  });
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
