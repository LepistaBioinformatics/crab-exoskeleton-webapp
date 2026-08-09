import { errorCode } from "@/lib/i18n/errors";
import type { Workspace } from "@/app/chat/fragment";

// The member's own models: register one, prove it answers, and choose between it
// and the model their administrator provides.
//
// Locale-free by construction, like lib/models.ts: this module emits CODES and
// data, and the copy is resolved at the point of display.

// One probe outcome, as the proxy records it. `detail` is an error CLASS
// ("bad_key", "timeout", "not_a_completion"), never a provider response body.
export interface ModelTestResult {
  ok: boolean;
  status_code?: number;
  latency_ms: number;
  detail?: string;
  at: string;
}

// A stored personal model. There is deliberately no api_key field: the API never
// returns one, and `has_key` is all the UI needs to render the badge.
export interface UserModel {
  owner_acc_id: string;
  slug: string;
  label: string;
  provider: string;
  model: string;
  api_base: string;
  extra_body?: unknown;
  enabled: boolean;
  has_key: boolean;
  last_test?: ModelTestResult;
  version: number;
  created_at: string;
  updated_at: string;
}

// Everything the drawer needs, in the shape one GET returns it. The four facts
// only mean anything together: "you selected X" plus "your scope is locked" is a
// different screen from either half alone.
export interface UserModelsState {
  models: UserModel[];
  /** The slug this workspace runs, or "" for the organisation's model. */
  selected: string;
  /** False when an administrator locked this scope against personal models. */
  allowed: boolean;
  /** Which scope level did the locking: "tenant", "global", … */
  blockedBy: string;
  /** The model the administrator's cascade resolves — the fallback, named. */
  organisationModel: string;
  /**
   * Whether this member may name an endpoint the catalog does not carry. Unset
   * everywhere means NO — picking a provider chooses among endpoints the
   * instance ships; typing one aims the proxy wherever the member likes, and an
   * administrator opens that per scope.
   */
  customEndpointAllowed: boolean;
  /** The providers a member may register, with the endpoint each answers on. */
  providers: ProviderOption[];
}

// One provider the member may pick, plus what the proxy's embedded catalog knows
// about it. `api_base` is the whole point: a member cannot be expected to know
// that nvidia answers on integrate.api.nvidia.com/v1, and a base missing its
// version path reaches a real host and 404s — which reads as "wrong provider".
export interface ProviderOption {
  provider: string;
  api_base?: string;
  models?: string[];
}

// The register/edit form's state. api_key is write-only: sent when non-empty,
// never populated from a response.
export interface UserModelDraft {
  slug: string;
  label: string;
  provider: string;
  model: string;
  api_base: string;
  api_key: string;
  extra_body: string;
}

// A factory, not a shared const — a shared object would hand every form the same
// instance to mutate.
export function emptyUserDraft(): UserModelDraft {
  return { slug: "", label: "", provider: "", model: "", api_base: "", api_key: "", extra_body: "" };
}

export function draftFromUserModel(m: UserModel): UserModelDraft {
  return {
    slug: m.slug,
    label: m.label,
    provider: m.provider,
    model: m.model,
    api_base: m.api_base,
    // Never populated: the API does not return it, and an edit that leaves it
    // blank keeps the stored one.
    api_key: "",
    extra_body: m.extra_body === undefined ? "" : JSON.stringify(m.extra_body, null, 2),
  };
}

// THE TEST GATE.
//
// A fingerprint of everything the probe actually sends. The Save button is armed
// by comparing the fingerprint that was TESTED with the fingerprint of what is in
// the form right now — so editing any field re-arms the gate automatically.
//
// A boolean ("hasTested") would have to be reset by hand at every edit site, and
// the one site somebody forgets is the one that lets an untested model through.
// The label is excluded because it changes nothing about the request.
export function draftFingerprint(d: UserModelDraft): string {
  return JSON.stringify([
    d.provider.trim().toLowerCase(),
    d.model.trim(),
    d.api_base.trim().replace(/\/+$/, ""),
    // The key VALUE, not its length. Provider keys are usually fixed-length, so
    // a length would treat "fix the typo in my key" as no change at all: the
    // form would keep showing the old red verdict for a key that now works —
    // and, worse, keep showing a green one for a key nobody has tested.
    // It costs no exposure: the plaintext key is already in this component's
    // state, two fields over.
    d.api_key,
    d.extra_body.trim(),
  ]);
}

export type SaveGate = "untested" | "tested-ok" | "tested-failed";

// What the Save button should be, given the last probe and the current draft.
// Pure, so the rule is testable without mounting the form.
export function saveGate(
  draft: UserModelDraft,
  tested: { fingerprint: string; ok: boolean } | null,
): SaveGate {
  if (!tested || tested.fingerprint !== draftFingerprint(draft)) return "untested";
  return tested.ok ? "tested-ok" : "tested-failed";
}

// applyProvider switches the draft's provider and carries the endpoint with it.
//
// It overwrites api_base only when the field is empty or still holds the PREVIOUS
// provider's suggestion. A member who typed their own gateway URL — a proxy, a
// self-hosted deployment — keeps it: silently replacing a deliberate address on a
// provider change would be the same class of bug as a stale test verdict.
export function applyProvider(
  draft: UserModelDraft,
  providers: ProviderOption[],
  next: string,
): UserModelDraft {
  const current = draft.api_base.trim();
  const previous = providers.find((p) => p.provider === draft.provider)?.api_base ?? "";
  const suggestion = providers.find((p) => p.provider === next)?.api_base ?? "";
  const keep = current !== "" && current !== previous;
  return { ...draft, provider: next, api_base: keep ? draft.api_base : suggestion };
}

// registerableProviders is what the picker offers.
//
// With custom endpoints refused, a provider the catalog carries no endpoint for
// is unusable: there is nothing to fill the field with and the member may not
// type one. Offering it anyway would be a choice that can only end in a refusal
// on submit.
export function registerableProviders(
  providers: ProviderOption[],
  customEndpointAllowed: boolean,
): ProviderOption[] {
  if (customEndpointAllowed) return providers;
  return providers.filter((p) => !!p.api_base);
}

// The models the catalog knows for a provider, offered as suggestions rather than
// a closed list: a provider's real model set changes faster than this catalog.
export function providerModels(providers: ProviderOption[], provider: string): string[] {
  return providers.find((p) => p.provider === provider)?.models ?? [];
}

// Whether a draft is complete enough to be worth probing. Deliberately NOT the
// full validation — the proxy owns that — just enough to keep the button from
// firing a request that cannot succeed.
export function canTest(draft: UserModelDraft, editingExisting: boolean): boolean {
  const filled = draft.provider.trim() && draft.model.trim() && draft.api_base.trim();
  if (!filled) return false;
  // Editing an existing model may reuse the stored key; a new one may not.
  return editingExisting || draft.api_key.trim().length > 0;
}

// extra_body is free-text JSON in the form. Returning the parse ERROR rather than
// throwing keeps the caller's error handling in one place.
export function parseExtraBody(raw: string): { value?: unknown; error?: string } {
  const text = raw.trim();
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { error: "extra_body_not_object" };
    }
    return { value };
  } catch {
    return { error: "extra_body_invalid" };
  }
}

// What is answering right now, as a fact the UI renders rather than three
// booleans it has to combine at the point of display.
export type EffectiveSource =
  | { kind: "organisation"; model: string }
  | { kind: "own"; model: UserModel }
  // Selected, but an administrator locked the scope or disabled the model — so
  // the organisation's model is answering DESPITE the selection. This state
  // exists precisely so the screen can say so instead of showing a switch that
  // silently does nothing.
  | { kind: "own-blocked"; model: UserModel | null; blockedBy: string; organisation: string };

export function effectiveSource(state: UserModelsState): EffectiveSource {
  const selected = state.models.find((m) => m.slug === state.selected) ?? null;
  if (!state.selected) return { kind: "organisation", model: state.organisationModel };
  if (!state.allowed || !selected || !selected.enabled) {
    return {
      kind: "own-blocked",
      model: selected,
      blockedBy: state.allowed ? "disabled" : state.blockedBy,
      organisation: state.organisationModel,
    };
  }
  return { kind: "own", model: selected };
}

// A slug the member never types. It is half the store key and part of the
// materialized model_name, so it has to be in the safe charset; deriving it from
// the label keeps one more field out of the form.
export function slugFromLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

function workspaceQuery(workspace: Workspace): URLSearchParams {
  return new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
  });
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as T;
}

export async function listUserModels(workspace: Workspace): Promise<UserModelsState> {
  const res = await fetch(`/api/models/mine?${workspaceQuery(workspace).toString()}`);
  const data = await json<{
    models?: UserModel[];
    selected?: string;
    allowed?: boolean;
    blocked_by?: string;
    custom_endpoint_allowed?: boolean;
    organisation_model?: string;
    providers?: ProviderOption[];
  }>(res);
  return {
    models: Array.isArray(data.models) ? data.models : [],
    selected: typeof data.selected === "string" ? data.selected : "",
    // Defaulting to true would show a working switch on a locked scope; false is
    // the safe reading of an answer we could not understand.
    allowed: data.allowed === true,
    blockedBy: typeof data.blocked_by === "string" ? data.blocked_by : "",
    // Defaulting to false: an answer we could not read must not put a free-text
    // endpoint field on screen that the proxy will refuse on submit.
    customEndpointAllowed: data.custom_endpoint_allowed === true,
    organisationModel: typeof data.organisation_model === "string" ? data.organisation_model : "",
    providers: Array.isArray(data.providers) ? data.providers : [],
  };
}

function body(workspace: Workspace, draft: UserModelDraft, extra: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    slug: draft.slug,
    label: draft.label,
    provider: draft.provider,
    model: draft.model,
    api_base: draft.api_base,
  };
  // Omitted when blank, so an edit that does not touch the key keeps the stored
  // one instead of clearing it.
  if (draft.api_key) out.api_key = draft.api_key;
  if (extra !== undefined) out.extra_body = extra;
  return out;
}

const post = (payload: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export async function createUserModel(
  workspace: Workspace,
  draft: UserModelDraft,
  extra: unknown,
): Promise<void> {
  await json(await fetch("/api/models/mine", post(body(workspace, draft, extra))));
}

// version carries the record the form was opened on, so the proxy's optimistic
// check is live rather than decorative: the same member editing from two tabs
// gets a conflict instead of a silent last-write-wins.
export async function updateUserModel(
  workspace: Workspace,
  draft: UserModelDraft,
  extra: unknown,
  version: number,
): Promise<void> {
  const query = workspaceQuery(workspace);
  query.set("slug", draft.slug);
  await json(
    await fetch(
      `/api/models/mine?${query.toString()}`,
      post({ ...body(workspace, draft, extra), version }, "PUT"),
    ),
  );
}

export async function deleteUserModel(workspace: Workspace, slug: string): Promise<void> {
  const query = workspaceQuery(workspace);
  query.set("slug", slug);
  await json(await fetch(`/api/models/mine?${query.toString()}`, { method: "DELETE" }));
}

export interface TestOutcome {
  ok: boolean;
  status_code?: number;
  latency_ms: number;
  detail?: string;
}

export async function testUserModel(
  workspace: Workspace,
  draft: UserModelDraft,
  extra: unknown,
): Promise<TestOutcome> {
  const res = await fetch("/api/models/mine/test", post(body(workspace, draft, extra)));
  return json<TestOutcome>(res);
}

export async function selectUserModel(workspace: Workspace, slug: string): Promise<void> {
  const query = workspaceQuery(workspace);
  await json(
    await fetch(
      `/api/models/mine/selection?${query.toString()}`,
      post({ tenant_id: workspace.t, subs_acc_id: workspace.s, role: workspace.r, slug }, "PUT"),
    ),
  );
}

export async function useOrganisationModel(workspace: Workspace): Promise<void> {
  const query = workspaceQuery(workspace);
  await json(await fetch(`/api/models/mine/selection?${query.toString()}`, { method: "DELETE" }));
}
