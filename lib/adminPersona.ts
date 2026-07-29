import { errorCode } from "@/lib/i18n/errors";
import { DEFAULT_POLICY, withPolicy, type RestartPolicy } from "@/lib/restartPolicy";
import type { ScopeRef } from "@/lib/admin";

// The agent's identity files, which the proxy delivers to every workspace under the
// scope as READ-ONLY bind mounts (crab-shell-proxy internal/docker/persona.go).
//
// The set is fixed and closed. The proxy refuses any other name with a 400, because
// these endpoints write into a workspace ROOT — an open name would be an
// arbitrary-file-write primitive reaching every container under the scope.
export const PERSONA_FILES = ["AGENT.md", "SOUL.md", "HEARTBEAT.md", "USER.md"] as const;
export type PersonaFile = (typeof PERSONA_FILES)[number];

// USER.md is the one that is NOT made read-only. The agent accumulates what it
// learns about the user there, so mounting it read-only would silently disable that
// write. Injecting it sets the content a workspace is SEEDED from on first
// provision; after that the file belongs to the agent and is never overwritten.
export const PERSONA_SEED_ONLY: PersonaFile = "USER.md";

export interface PersonaEntry {
  name: string;
  size: number;
  modifiedAt?: string;
}

// Persona is always agent-scoped: the cascade has no agent-less layer, and the
// proxy rejects a write without one. `scope.agent` is therefore required, not
// optional as it is for files/secrets/skills.
function scopeParams(scope: ScopeRef): URLSearchParams {
  const q = new URLSearchParams({ scope: scope.kind, tenant_id: scope.tenantId });
  if (scope.kind === "subscription" && scope.subsAccId) q.set("subs_acc_id", scope.subsAccId);
  if (scope.agent) q.set("agent", scope.agent);
  return q;
}

/** The files injected AT THIS SCOPE — not what a workspace ends up resolving to. */
export async function listPersona(scope: ScopeRef): Promise<PersonaEntry[]> {
  const res = await fetch(`/api/admin/persona?${scopeParams(scope).toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  return Array.isArray(data.files) ? (data.files as PersonaEntry[]) : [];
}

/**
 * The injected content, or null when nothing is injected at this scope — which is
 * not an error: it means the next cascade layer, or the agent template, is what
 * workspaces get.
 */
export async function readPersona(scope: ScopeRef, name: PersonaFile): Promise<string | null> {
  const q = scopeParams(scope);
  q.set("name", name);
  const res = await fetch(`/api/admin/persona/doc?${q.toString()}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  return typeof data.content === "string" ? data.content : "";
}

export async function savePersona(
  scope: ScopeRef,
  name: PersonaFile,
  body: string,
  policy: RestartPolicy = DEFAULT_POLICY,
): Promise<void> {
  const form = new FormData();
  form.set("scope", scope.kind);
  form.set("tenant_id", scope.tenantId);
  if (scope.kind === "subscription" && scope.subsAccId) form.set("subs_acc_id", scope.subsAccId);
  if (scope.agent) form.set("agent", scope.agent);
  form.set("name", name);
  form.set("body", body);
  const res = await fetch(withPolicy("/api/admin/persona", policy), { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorCode(res));
}

/** Drops the injection so the next cascade layer takes over. Idempotent. */
export async function deletePersona(
  scope: ScopeRef,
  name: PersonaFile,
  policy: RestartPolicy = DEFAULT_POLICY,
): Promise<void> {
  const q = scopeParams(scope);
  q.set("name", name);
  const res = await fetch(withPolicy(`/api/admin/persona?${q.toString()}`, policy), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await errorCode(res));
}
