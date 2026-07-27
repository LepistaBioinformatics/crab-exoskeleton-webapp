import { DEFAULT_POLICY, withPolicy, type RestartPolicy } from "@/lib/restartPolicy";
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

// reorderPayload returns the full name list to submit for a reorder: the active
// group with one entry moved, followed by every inactive model. Both groups must
// be present — the server renumbers 1..N over exactly what it receives, so an
// active-only payload would leave inactive models holding stale positions that
// collide with active ones, and a reactivated model would not land back in its
// place. Returns null when the move is out of bounds.
export function reorderPayload(
  active: InventoryModel[],
  inactive: InventoryModel[],
  index: number,
  delta: number,
): string[] | null {
  const next = [...active];
  const to = index + delta;
  if (to < 0 || to >= next.length) return null;
  [next[index], next[to]] = [next[to], next[index]];
  return [...next, ...inactive].map((m) => m.model_name);
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
  /** An error CODE, resolved to text by lib/i18n/errors at the point of
   *  display. This module stays locale-free. */
  code: string;
  versionConflict: boolean;
  referrers: Referrer[];
}

// modelsApiError turns a failed response into something the panel can render
// specifically: a stale version says "reload", an in-use rejection names what to
// detach. A generic conflict code would leave the admin with no next action.
export async function modelsApiError(res: Response): Promise<ModelsError> {
  const data = await res.json().catch(() => null);
  const referrers: Referrer[] = Array.isArray(data?.referrers) ? data.referrers : [];
  const versionConflict = data?.version_conflict === true;
  const e = data?.error;
  let code = "unknown";
  if (versionConflict) {
    code = "version_conflict";
  } else if (typeof e === "string" && e.trim()) {
    code = e.trim();
  }
  return { code, versionConflict, referrers };
}

// DisplayError is what a panel actually renders: a message plus whatever
// referrers a 409 in-use rejection carried, if any.
export interface DisplayError {
  code: string;
  referrers: Referrer[];
}

// describeError turns a caught error into a DisplayError. request() throws an
// Error carrying modelsApiError's fields (see below), so the code rides on the
// error itself — this only needs to pull it and the referrers back off safely,
// and to give a non-Error throw a generic code.
export function describeError(e: unknown): DisplayError {
  if (e instanceof Error) {
    const { code, referrers } = e as Partial<ModelsError>;
    return {
      code: typeof code === "string" && code ? code : "unknown",
      referrers: Array.isArray(referrers) ? referrers : [],
    };
  }
  return { code: "unknown", referrers: [] };
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

export async function updateModel(
  agent: Instance,
  name: string,
  version: number,
  draft: ModelDraft,
  // How the resulting bounce of every workspace holding this model is delivered
  // (restart-control FR-4). Omitted means "now" -- this call's prior behaviour.
  policy: RestartPolicy = DEFAULT_POLICY,
): Promise<void> {
  await request(withPolicy(`/api/admin/models?${q(agent, { name })}`, policy), {
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

export async function setModelDefault(
  agent: Instance,
  scope: DefaultScope,
  modelName: string,
  policy: RestartPolicy = DEFAULT_POLICY,
): Promise<void> {
  await request(withPolicy(`/api/admin/model-defaults?${defaultScopeQuery(agent, scope)}`, policy), {
    ...json({ agent, model_name: modelName }),
    method: "PUT",
  });
}

export async function clearModelDefault(
  agent: Instance,
  scope: DefaultScope,
  policy: RestartPolicy = DEFAULT_POLICY,
): Promise<void> {
  await request(withPolicy(`/api/admin/model-defaults?${defaultScopeQuery(agent, scope)}`, policy), {
    method: "DELETE",
  });
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
  policy: RestartPolicy = DEFAULT_POLICY,
): Promise<void> {
  await request(
    withPolicy("/api/admin/model-assignments", policy),
    json({
      agent,
      tenant_id: target.tenantId,
      subs_acc_id: target.subsAccId,
      user_acc_id: target.userAccId,
      model_name: modelName,
    }),
  );
}

// ModelAssignment is one recorded materialization. `source` is what tells a
// deliberate pin apart from a cascade result: "explicit" means an admin pinned this
// user, "inherited" means it came from a scope default and a scope change still
// moves it.
export interface ModelAssignment {
  agent: string;
  user_acc_id: string;
  model_name: string;
  source: "explicit" | "inherited";
}

// listModelAssignments returns the assignments under one subscription keyed by
// "<agent>|<userAccId>" — a user with a workspace under more than one agent has one
// record per agent, exactly as listSubscriptionUsers reports them.
export async function listModelAssignments(
  agent: Instance,
  target: Omit<AssignmentTarget, "userAccId">,
): Promise<Record<string, ModelAssignment>> {
  const data = (await request(
    `/api/admin/model-assignments?${q(agent, {
      tenant_id: target.tenantId,
      subs_acc_id: target.subsAccId,
    })}`,
  )) as { assignments?: ModelAssignment[] };
  return assignmentIndex(Array.isArray(data.assignments) ? data.assignments : []);
}

export function assignmentKey(agent: string, userAccId: string): string {
  return `${agent}|${userAccId}`;
}

export function assignmentIndex(list: ModelAssignment[]): Record<string, ModelAssignment> {
  const out: Record<string, ModelAssignment> = {};
  for (const a of list) {
    out[assignmentKey(a.agent, a.user_acc_id)] = a;
  }
  return out;
}

// pinnedModel is the model name an admin explicitly pinned to a workspace, or null
// when the workspace resolves through the cascade. An inherited record is NOT a
// pin: it only says what was materialized, and the next scope-default change moves
// it — which is exactly the distinction the panel has to render.
export function pinnedModel(a: ModelAssignment | undefined): string | null {
  return a && a.source === "explicit" ? a.model_name : null;
}

// defaultOptions is the option list for the scope-default select: the active
// models, plus the current default when it is no longer active. Without that
// addition a deprecated default matches no option and the control reads "no default
// set" while one IS set.
export function defaultOptions(
  models: InventoryModel[],
  current: string | null,
): { name: string; inactive: boolean }[] {
  const active = models.filter((m) => m.status === "active");
  const options = active.map((m) => ({ name: m.model_name, inactive: false }));
  if (current && !active.some((m) => m.model_name === current)) {
    options.unshift({ name: current, inactive: true });
  }
  return options;
}

export async function clearModelAssignment(
  agent: Instance,
  target: AssignmentTarget,
  policy: RestartPolicy = DEFAULT_POLICY,
): Promise<void> {
  await request(withPolicy("/api/admin/model-assignments", policy), {
    ...json({
      agent,
      tenant_id: target.tenantId,
      subs_acc_id: target.subsAccId,
      user_acc_id: target.userAccId,
    }),
    method: "DELETE",
  });
}

// ── The resolution ladder ────────────────────────────────────────────────────
//
// The cascade is the product's central fact: a workspace's model comes from the
// most specific level that has one, and the levels below stay set and take over
// when a level above is cleared. The old panel showed exactly ONE level at a
// time, so an admin could not see what their write would override, nor what
// clearing it would fall back to — which is the same blindness the two competing
// model systems had before this feature replaced them.
//
// buildLadder turns the four scope reads plus the pin count into rungs, ordered
// most specific first. Pure so the precedence logic is testable without mounting
// the panel.

export type LadderLevel = "user" | "subscription" | "tenant" | "agent" | "global";

export interface LadderRung {
  level: LadderLevel;
  /** What the admin calls this level, in their own vocabulary. */
  label: string;
  /** The model this level names, or null when the level is unset. */
  modelName: string | null;
  /** Extra context for the value — a date, a count, "instance-wide". */
  detail?: string;
  /** True for the one level that decides what new workspaces get. */
  inEffect: boolean;
  /** Set when the level has a value that a more specific level overrides. */
  overridden: boolean;
  /** True when the caller's privileges do not let them read this level. */
  unreadable: boolean;
  /**
   * True when the level exists in the cascade but is not addressable from the
   * scope the admin has selected — a subscription default cannot be read or
   * written while the rail sits on the tenant.
   */
  outOfScope: boolean;
}

export interface LadderInput {
  /** How many people in this subscription are pinned to a specific model. */
  pinnedCount: number;
  /** null = level is unset; undefined = the caller may not read it. */
  subscription: ScopeDefault | null | undefined;
  tenant: ScopeDefault | null | undefined;
  agent: ScopeDefault | null | undefined;
  global: ScopeDefault | null | undefined;
  /** Names the levels: "Pesquisa", "Biotrop", "alpha". */
  names: { subscription?: string; tenant?: string; agent?: string };
  /**
   * Levels the selected scope cannot address. Kept apart from the null/undefined
   * pair on purpose: there are three different facts, and collapsing any two of
   * them makes the ladder say something false. `null` means the level is unset
   * and setting it is one click away; `undefined` means the caller was refused;
   * this means the level is real but belongs to a scope the admin has not
   * selected, so there is nothing to set until they select one.
   */
  outOfScope?: LadderLevel[];
  /** Rung wording, injected so this module emits no UI text of its own. */
  copy: LadderCopy;
}

export interface LadderCopy {
  pinned: string;
  pinnedDetail: string;
  nobodyPinned: string;
  subscription: string;
  subscriptionNamed: string;
  tenant: string;
  tenantNamed: string;
  agentNamed: string;
  /**
   * The agent level's detail. NOT instanceWide: this level is stored per agent
   * (`agent/<agent>`), so it reaches every tenant but only this agent's
   * workspaces — and an admin reading "instance-wide" next to one agent's name
   * cannot tell which of the two it means.
   */
  agentDetail: string;
  thisAgent: string;
  everythingElse: string;
  instanceWide: string;
  // Prompts for a level the selected scope cannot address.
  selectSubscriptionForPins: string;
  selectSubscription: string;
  selectTenant: string;
  selectAgent: string;
}

// What to do about a level the current scope cannot address. The rung says the
// next action rather than the state, because "not set" was the whole confusion:
// an admin on a tenant read it as "this subscription has no default" when the
// truth is "no subscription is selected". The wording is injected like the rest
// of the rung copy, so this module still emits no UI text of its own.
function scopePrompt(c: LadderCopy): Record<LadderLevel, string> {
  return {
    user: c.selectSubscriptionForPins,
    subscription: c.selectSubscription,
    tenant: c.selectTenant,
    agent: c.selectAgent,
    global: "",
  };
}

export function buildLadder(input: LadderInput): LadderRung[] {
  const c = input.copy;
  const prompts = scopePrompt(c);
  const agentName = input.names.agent ?? c.thisAgent;
  const raw: {
    level: LadderLevel;
    label: string;
    d: ScopeDefault | null | undefined;
    detail?: string;
  }[] = [
    {
      level: "user",
      label: c.pinned,
      // A pin is per person, so it never resolves for the scope as a whole — it
      // is shown because it OUTRANKS everything below, which is the fact an
      // admin needs when a scope change appears not to reach someone.
      d: null,
      detail:
        input.pinnedCount > 0
          ? c.pinnedDetail.replace("{n}", String(input.pinnedCount))
          : c.nobodyPinned,
    },
    {
      level: "subscription",
      label: input.names.subscription
        ? c.subscriptionNamed.replace("{name}", input.names.subscription)
        : c.subscription,
      d: input.subscription,
    },
    {
      level: "tenant",
      label: input.names.tenant ? c.tenantNamed.replace("{name}", input.names.tenant) : c.tenant,
      d: input.tenant,
    },
    {
      level: "agent",
      label: c.agentNamed.replace("{name}", agentName),
      d: input.agent,
      // agentDetail, not instanceWide — see the LadderCopy field's note.
      detail: c.agentDetail.replace("{name}", agentName),
    },
    { level: "global", label: c.everythingElse, d: input.global, detail: c.instanceWide },
  ];

  // The first level with a readable value wins. A level the caller cannot read
  // is skipped rather than treated as empty: claiming "not set" for something we
  // were refused would be a lie, and would make the fallback prediction wrong.
  let decided = false;
  return raw.map((r) => {
    const outOfScope = input.outOfScope?.includes(r.level) ?? false;
    const unreadable = !outOfScope && r.d === undefined;
    // The flag is authoritative: a level the scope cannot address shows no value
    // even if the caller happened to pass one, because a value shown on that rung
    // would be some OTHER subscription's.
    const modelName = outOfScope ? null : (r.d?.model_name ?? null);
    const inEffect = !decided && !unreadable && !outOfScope && modelName !== null;
    if (inEffect) decided = true;
    return {
      level: r.level,
      label: r.label,
      modelName,
      detail: outOfScope ? prompts[r.level] : r.detail,
      inEffect,
      overridden: !inEffect && !unreadable && !outOfScope && modelName !== null,
      unreadable,
      outOfScope,
    };
  });
}

// fallbackIfCleared answers the question the ladder exists to answer: if the
// level currently in effect were cleared, what would these workspaces move to?
// null means nothing below is set, so clearing would leave them with no
// resolvable model — which refuses to provision rather than defaulting.
export function fallbackIfCleared(rungs: LadderRung[]): string | null {
  const winner = rungs.findIndex((r) => r.inEffect);
  if (winner === -1) return null;
  for (const r of rungs.slice(winner + 1)) {
    if (r.modelName) return r.modelName;
  }
  return null;
}
