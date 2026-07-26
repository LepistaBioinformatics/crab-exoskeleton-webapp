import type { Instance } from "@/lib/mycelium";

export type ModelStatus = "active" | "disabled" | "deprecated";

// InventoryModel mirrors the proxy's PublicModel. There is deliberately no
// api_key field: the API never returns one.
export interface InventoryModel {
  model_name: string;
  provider: string;
  model: string;
  api_base?: string;
  auth_method?: string;
  extra_body?: unknown;
  status: ModelStatus;
  replaced_by?: string;
  fallbacks: string[];
  position: number;
  has_key: boolean;
  in_use_count: number;
  imported_orphan?: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

// CatalogEntry is a prefill suggestion. It carries no key and no model_name.
export interface CatalogEntry {
  provider: string;
  model: string;
  api_base?: string;
  auth_method?: string;
  extra_body?: unknown;
}

export interface Referrer {
  kind: "workspace" | "scope_default" | "replaced_by" | "fallback";
  id: string;
}

export interface ScopeDefault {
  model_name: string;
  updated_at: string;
}

// ModelDraft is the register/edit form's state. api_key is write-only: it is sent
// when non-empty and never populated from a response.
export interface ModelDraft {
  model_name: string;
  provider: string;
  model: string;
  api_base: string;
  auth_method: string;
  api_key: string;
  fallbacks: string[];
  extra_body?: unknown;
}

// A factory, not a shared const: a shared object would hand every draft the SAME
// fallbacks array, so editing one form's chain would mutate the template.
export function emptyDraft(): ModelDraft {
  return {
    model_name: "",
    provider: "",
    model: "",
    api_base: "",
    auth_method: "",
    api_key: "",
    fallbacks: [],
  };
}

// splitInventory groups the listing the way the panel renders it. The active group
// is ordered by position, which is PRESENTATION ONLY — it is not the fallback
// chain, and the UI must not imply otherwise.
export function splitInventory(models: InventoryModel[]): {
  active: InventoryModel[];
  inactive: InventoryModel[];
} {
  const active = models.filter((m) => m.status === "active").sort((a, b) => a.position - b.position);
  const inactive = models
    .filter((m) => m.status !== "active")
    .sort((a, b) => a.position - b.position);
  return { active, inactive };
}

// inactiveReason is the badge text for the inactive group. Deprecated names its
// replacement, because "where do new users go instead" is the first thing an admin
// looking at a retired model needs to know.
export function inactiveReason(m: InventoryModel): string {
  if (m.status === "deprecated") {
    return `deprecated → replaced by ${m.replaced_by ?? "?"}`;
  }
  if (m.status === "disabled") {
    return "disabled";
  }
  return "";
}

export function draftFromCatalog(entry: CatalogEntry): ModelDraft {
  return {
    ...emptyDraft(),
    provider: entry.provider,
    model: entry.model,
    api_base: entry.api_base ?? "",
    auth_method: entry.auth_method ?? "",
    extra_body: entry.extra_body,
  };
}

// draftFromDuplicate copies an existing entry for editing. model_name is blank
// because it must be unique, and api_key because the API never returns it.
export function draftFromDuplicate(m: InventoryModel): ModelDraft {
  return {
    model_name: "",
    provider: m.provider,
    model: m.model,
    api_base: m.api_base ?? "",
    auth_method: m.auth_method ?? "",
    api_key: "",
    fallbacks: [...m.fallbacks],
    extra_body: m.extra_body,
  };
}

export interface ModelsError {
  message: string;
  versionConflict: boolean;
  referrers: Referrer[];
}

// modelsApiError turns a failed response into something the panel can render
// specifically: a stale version says "reload", an in-use rejection names what to
// detach. A generic conflict message would leave the admin with no next action.
export async function modelsApiError(res: Response): Promise<ModelsError> {
  const data = await res.json().catch(() => null);
  const referrers: Referrer[] = Array.isArray(data?.referrers) ? data.referrers : [];
  const versionConflict = data?.version_conflict === true;
  const e = data?.error;
  let message = "Something went wrong.";
  if (e === "connectivity") {
    message = "Can't reach the gateway right now.";
  } else if (e === "session_expired") {
    message = "Your session expired — sign in again.";
  } else if (versionConflict) {
    message = "Another admin changed this model — reload before saving.";
  } else if (typeof e === "string" && e.trim()) {
    message = e;
  }
  return { message, versionConflict, referrers };
}

// DisplayError is what a panel actually renders: a message plus whatever
// referrers a 409 in-use rejection carried, if any.
export interface DisplayError {
  message: string;
  referrers: Referrer[];
}

// describeError turns a caught error into a DisplayError. request() throws an
// Error carrying modelsApiError's fields (see below), so e.message already has
// the right wording for a version conflict — this only needs to pull the
// referrers back off safely, and to give a non-Error throw a generic message.
export function describeError(e: unknown): DisplayError {
  if (e instanceof Error) {
    const referrers = (e as Partial<ModelsError>).referrers;
    return { message: e.message, referrers: Array.isArray(referrers) ? referrers : [] };
  }
  return { message: "Something went wrong.", referrers: [] };
}

// request throws an Error carrying the ModelsError fields, so a caller can render
// a version conflict or an in-use referrer list without a second round trip.
async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw Object.assign(new Error("request failed"), await modelsApiError(res));
  }
  return res.json().catch(() => ({}));
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const q = (agent: Instance, extra: Record<string, string> = {}) =>
  new URLSearchParams({ agent, ...extra }).toString();

export async function listModels(agent: Instance): Promise<InventoryModel[]> {
  const data = (await request(`/api/admin/models?${q(agent)}`)) as { models?: InventoryModel[] };
  return Array.isArray(data.models) ? data.models : [];
}

export async function modelCatalog(agent: Instance): Promise<CatalogEntry[]> {
  const data = (await request(`/api/admin/model-catalog?${q(agent)}`)) as { entries?: CatalogEntry[] };
  return Array.isArray(data.entries) ? data.entries : [];
}

export async function createModel(agent: Instance, draft: ModelDraft): Promise<void> {
  await request("/api/admin/models", json({ agent, ...serializeDraft(draft) }));
}

export async function updateModel(agent: Instance, name: string, version: number, draft: ModelDraft): Promise<void> {
  await request(`/api/admin/models?${q(agent, { name })}`, {
    ...json({ agent, name, version, ...serializeDraft(draft) }),
    method: "PUT",
  });
}

// serializeDraft omits api_key when blank, so an edit that does not touch the key
// keeps the stored one instead of clearing it.
export function serializeDraft(draft: ModelDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model_name: draft.model_name,
    provider: draft.provider,
    model: draft.model,
    api_base: draft.api_base,
    auth_method: draft.auth_method,
    fallbacks: draft.fallbacks,
  };
  if (draft.api_key) {
    body.api_key = draft.api_key;
  }
  if (draft.extra_body !== undefined) {
    body.extra_body = draft.extra_body;
  }
  return body;
}

export async function deleteModel(agent: Instance, name: string): Promise<void> {
  await request(`/api/admin/models?${q(agent, { name })}`, { method: "DELETE" });
}

export async function setModelStatus(
  agent: Instance,
  name: string,
  version: number,
  status: ModelStatus,
): Promise<void> {
  await request(`/api/admin/models/status?${q(agent, { name })}`, {
    ...json({ agent, name, version, status }),
    method: "PUT",
  });
}

export async function deprecateModel(
  agent: Instance,
  name: string,
  version: number,
  replacedBy: string,
): Promise<void> {
  await request("/api/admin/models/deprecate", json({ agent, name, version, replaced_by: replacedBy }));
}

export async function reorderModels(agent: Instance, order: string[]): Promise<void> {
  await request("/api/admin/models/order", { ...json({ agent, order }), method: "PUT" });
}

export async function modelUsage(agent: Instance, name: string): Promise<Referrer[]> {
  const data = (await request(`/api/admin/models/usage?${q(agent, { name })}`)) as {
    referrers?: Referrer[];
  };
  return Array.isArray(data.referrers) ? data.referrers : [];
}

export type DefaultScope =
  | { kind: "global" }
  | { kind: "agent" }
  | { kind: "tenant"; tenantId: string }
  | { kind: "subscription"; tenantId: string; subsAccId: string };

function defaultScopeQuery(agent: Instance, scope: DefaultScope): string {
  const extra: Record<string, string> = { scope: scope.kind };
  if (scope.kind === "tenant" || scope.kind === "subscription") {
    extra.tenant_id = scope.tenantId;
  }
  if (scope.kind === "subscription") {
    extra.subs_acc_id = scope.subsAccId;
  }
  return q(agent, extra);
}

export async function getModelDefault(agent: Instance, scope: DefaultScope): Promise<ScopeDefault | null> {
  const data = (await request(`/api/admin/model-defaults?${defaultScopeQuery(agent, scope)}`)) as {
    default?: ScopeDefault | null;
  };
  return data.default ?? null;
}

export async function setModelDefault(agent: Instance, scope: DefaultScope, modelName: string): Promise<void> {
  await request(`/api/admin/model-defaults?${defaultScopeQuery(agent, scope)}`, {
    ...json({ agent, model_name: modelName }),
    method: "PUT",
  });
}

export async function clearModelDefault(agent: Instance, scope: DefaultScope): Promise<void> {
  await request(`/api/admin/model-defaults?${defaultScopeQuery(agent, scope)}`, { method: "DELETE" });
}

export interface AssignmentTarget {
  tenantId: string;
  subsAccId: string;
  userAccId: string;
}

export async function setModelAssignment(
  agent: Instance,
  target: AssignmentTarget,
  modelName: string,
): Promise<void> {
  await request(
    "/api/admin/model-assignments",
    json({
      agent,
      tenant_id: target.tenantId,
      subs_acc_id: target.subsAccId,
      user_acc_id: target.userAccId,
      model_name: modelName,
    }),
  );
}

export async function clearModelAssignment(agent: Instance, target: AssignmentTarget): Promise<void> {
  await request("/api/admin/model-assignments", {
    ...json({
      agent,
      tenant_id: target.tenantId,
      subs_acc_id: target.subsAccId,
      user_acc_id: target.userAccId,
    }),
    method: "DELETE",
  });
}
