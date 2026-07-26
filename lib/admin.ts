import type { SecretNames, SecretFormat } from "@/lib/secrets";

// A scope the caller may administer (GET /api/admin/scopes). Modeled on the
// subscription-discovery shape (camelCase ids + display names) plus a `kind`
// discriminator, so the pickers show names rather than raw UUIDs. A `tenant`
// scope carries only tenantId; a `subscription` scope carries both.
export interface AdminScope {
  kind: "tenant" | "subscription";
  tenantId: string;
  subsAccId?: string;
  tenantName?: string;
  accName?: string;
}

// A resolved scope target passed to the shared-file / shared-secret calls.
// `agent` narrows the target to a single agent's store; `ALL_AGENTS` (or
// omitting it) addresses the store every agent under the scope reads.
export interface ScopeRef {
  kind: "tenant" | "subscription";
  tenantId: string;
  subsAccId?: string;
  agent?: string;
}

// The sentinel the proxy understands for "the store every agent reads". Kept as
// an explicit value (rather than an empty string) so the picker has something to
// render and the wire format is self-describing.
export const ALL_AGENTS = "all";

// One agent key this deployment runs (GET /api/admin/agents). Sourced from the
// proxy config, so a new agent in config.yaml shows up without a webapp change.
// harness says which runtime it orchestrates; the model inventory governs
// picoclaw agents only (hermes reads its model from the proxy's config.yaml).
export interface AgentRef {
  key: string;
  harness?: string;
}

// Agents the model inventory actually governs. An older proxy reports no harness
// at all, and picoclaw was the only harness then, so an absent value counts as
// picoclaw rather than hiding every agent from the picker.
export function picoclawAgentKeys(agents: AgentRef[]): string[] {
  return agents.filter((a) => !a.harness || a.harness === "picoclaw").map((a) => a.key);
}

// FileMeta from the proxy -- metadata only, never bytes. Serves both shared
// files and (in the Members panel) a user's private files.
export interface FileMeta {
  name: string;
  size: number;
  modifiedAt?: string;
}

// An end user under a subscription (UserRef). `accId` is the mycelium account
// id; `name`/`email` are best-effort display fields. `role` is the agent the
// user has a workspace under — a user present in more than one agent (alpha +
// beta) is returned once per agent, so (role, accId) is the unique identity.
export interface UserRef {
  accId: string;
  role?: string;
  name?: string;
  email?: string;
}

function scopeParams(scope: ScopeRef): URLSearchParams {
  const q = new URLSearchParams({ scope: scope.kind, tenant_id: scope.tenantId });
  if (scope.kind === "subscription" && scope.subsAccId) q.set("subs_acc_id", scope.subsAccId);
  if (scope.agent) q.set("agent", scope.agent);
  return q;
}

export function scopeKey(scope: ScopeRef): string {
  const base =
    scope.kind === "tenant" ? `t:${scope.tenantId}` : `s:${scope.tenantId}:${scope.subsAccId}`;
  return scope.agent ? `${base}@${scope.agent}` : base;
}

// True when the caller may administer the given workspace scope: they hold the
// tenant scope for that tenant (controls every subscription under it), or the
// subscription scope matching that exact tenant + subscription account. Drives
// who may configure native (picoclaw) secrets, on both the client (UI gating)
// and the server (the real gate in /api/secrets).
export function canManageWorkspaceScope(
  scopes: AdminScope[],
  tenantId: string,
  subsAccId: string,
): boolean {
  return scopes.some(
    (s) =>
      (s.kind === "tenant" && s.tenantId === tenantId) ||
      (s.kind === "subscription" && s.tenantId === tenantId && s.subsAccId === subsAccId),
  );
}

export async function listScopes(): Promise<AdminScope[]> {
  const res = await fetch("/api/admin/scopes");
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.scopes) ? (data.scopes as AdminScope[]) : [];
}

export async function listAgents(): Promise<AgentRef[]> {
  const res = await fetch("/api/admin/agents");
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.agents) ? (data.agents as AgentRef[]) : [];
}

export async function listSharedFiles(scope: ScopeRef): Promise<FileMeta[]> {
  const res = await fetch(`/api/admin/shared?${scopeParams(scope).toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.files) ? (data.files as FileMeta[]) : [];
}

export async function uploadSharedFile(scope: ScopeRef, file: File): Promise<void> {
  const form = new FormData();
  form.set("scope", scope.kind);
  form.set("tenant_id", scope.tenantId);
  if (scope.kind === "subscription" && scope.subsAccId) form.set("subs_acc_id", scope.subsAccId);
  if (scope.agent) form.set("agent", scope.agent);
  form.set("file", file, file.name);
  const res = await fetch("/api/admin/shared", { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorMessage(res));
}

// URL for a shared-file download (bytes stream back through the BFF). Used as
// an <a href> so the browser handles the save.
export function sharedFileDownloadUrl(scope: ScopeRef, name: string): string {
  const q = scopeParams(scope);
  q.set("name", name);
  return `/api/admin/shared/content?${q.toString()}`;
}

export async function deleteSharedFile(scope: ScopeRef, name: string): Promise<void> {
  const q = scopeParams(scope);
  q.set("name", name);
  const res = await fetch(`/api/admin/shared?${q.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function listSharedSecrets(scope: ScopeRef): Promise<SecretNames> {
  const res = await fetch(`/api/admin/shared-secrets?${scopeParams(scope).toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  const s = data.secrets ?? {};
  return {
    dotenv: Array.isArray(s.dotenv) ? s.dotenv : [],
    json: Array.isArray(s.json) ? s.json : [],
    native: Array.isArray(s.native) ? s.native : [],
    file: Array.isArray(s.file) ? s.file : [],
  };
}

export async function setSharedSecret(
  scope: ScopeRef,
  input: { format: SecretFormat; name: string; value: string },
): Promise<void> {
  const res = await fetch("/api/admin/shared-secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: scope.kind,
      tenant_id: scope.tenantId,
      subs_acc_id: scope.subsAccId,
      agent: scope.agent,
      format: input.format,
      name: input.name,
      value: input.value,
    }),
  });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function deleteSharedSecret(
  scope: ScopeRef,
  input: { format: SecretFormat; name: string },
): Promise<void> {
  const q = scopeParams(scope);
  q.set("format", input.format);
  q.set("name", input.name);
  const res = await fetch(`/api/admin/shared-secrets?${q.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res));
}

export async function listSubscriptionUsers(
  tenantId: string,
  subsAccId: string,
): Promise<UserRef[]> {
  const q = new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId });
  const res = await fetch(`/api/admin/users?${q.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.users) ? (data.users as UserRef[]) : [];
}

// Metadata only -- the API has no path to a private file's bytes (FR-7).
export async function listUserFiles(
  tenantId: string,
  subsAccId: string,
  userAccId: string,
): Promise<FileMeta[]> {
  const q = new URLSearchParams({
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    user_acc_id: userAccId,
  });
  const res = await fetch(`/api/admin/users/files?${q.toString()}`);
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = await res.json();
  return Array.isArray(data.files) ? (data.files as FileMeta[]) : [];
}

export async function deleteUserFile(
  tenantId: string,
  subsAccId: string,
  userAccId: string,
  name: string,
): Promise<void> {
  const q = new URLSearchParams({
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    user_acc_id: userAccId,
    name,
  });
  const res = await fetch(`/api/admin/users/files?${q.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorMessage(res));
}

// Resolves display names before the scope tree renders (no uuid flash). Tenant
// names come from the mycelium tenant lookup (/api/tenants/[id]). Subscription
// account names ride in from /scopes when the caller is that subscription's
// manager; the rest are resolved via /api/accounts/[id] (the
// subscriptionsManager.accounts.get RPC, which a tenant/instance manager may
// call scoped by tenant). Anything unresolved falls back to its id, so the tree
// always renders.
export async function resolveScopeNames(scopes: AdminScope[]): Promise<AdminScope[]> {
  const tenantNames = new Map<string, string>();
  const accNames = new Map<string, string>();
  const tenantIds = Array.from(new Set(scopes.map((s) => s.tenantId)));
  const unnamedSubs = scopes.filter(
    (s) => s.kind === "subscription" && s.subsAccId && !s.accName,
  );

  await Promise.all([
    ...tenantIds.map(async (id) => {
      try {
        const res = await fetch(`/api/tenants/${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const data = await res.json();
        const name = tenantDisplayName(data.tenant);
        if (name) tenantNames.set(id, name);
      } catch {
        // leave unresolved -> the tree shows the id
      }
    }),
    ...unnamedSubs.map(async (s) => {
      try {
        const q = new URLSearchParams({ tenant_id: s.tenantId });
        const res = await fetch(`/api/accounts/${encodeURIComponent(s.subsAccId!)}?${q.toString()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data.name === "string" && data.name.trim()) {
          accNames.set(s.subsAccId!, data.name.trim());
        }
      } catch {
        // leave unresolved -> the tree shows the id
      }
    }),
  ]);

  return scopes.map((s) => ({
    ...s,
    tenantName: tenantNames.get(s.tenantId) ?? s.tenantName,
    accName: s.accName ?? (s.subsAccId ? accNames.get(s.subsAccId) : undefined),
  }));
}

function tenantDisplayName(tenant: unknown): string | null {
  if (tenant && typeof tenant === "object") {
    const name = (tenant as { name?: unknown }).name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return null;
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
