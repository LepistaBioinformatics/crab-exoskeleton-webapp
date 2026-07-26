import { errorCode } from "@/lib/i18n/errors";
import type { ScopeRef } from "@/lib/admin";

// SkillMeta from the proxy -- metadata only; content is fetched separately via
// sharedSkillDoc (SKILL.md text) or downloaded as a zip via
// sharedSkillArchiveUrl. Mirrors lib/admin.ts's FileMeta pattern.
export interface SkillMeta {
  name: string;
  description: string;
  size: number;
  modifiedAt?: string;
  hasFiles: boolean;
}

// Same scope->query-params shape as lib/admin.ts's (unexported) scopeParams --
// replicated here rather than exported from lib/admin.ts.
function scopeParams(scope: ScopeRef): URLSearchParams {
  const q = new URLSearchParams({ scope: scope.kind, tenant_id: scope.tenantId });
  if (scope.kind === "subscription" && scope.subsAccId) q.set("subs_acc_id", scope.subsAccId);
  if (scope.agent) q.set("agent", scope.agent);
  return q;
}

export async function listSharedSkills(scope: ScopeRef): Promise<SkillMeta[]> {
  const res = await fetch(`/api/admin/skills?${scopeParams(scope).toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  const data = await res.json();
  return Array.isArray(data.skills) ? (data.skills as SkillMeta[]) : [];
}

export async function sharedSkillDoc(
  scope: ScopeRef,
  name: string,
): Promise<{ name: string; content: string; meta: SkillMeta }> {
  const q = scopeParams(scope);
  q.set("name", name);
  const res = await fetch(`/api/admin/skills/doc?${q.toString()}`);
  if (!res.ok) throw new Error(await errorCode(res));
  return res.json();
}

export async function saveSharedSkillDoc(scope: ScopeRef, name: string, body: string): Promise<void> {
  const form = new FormData();
  form.set("scope", scope.kind);
  form.set("tenant_id", scope.tenantId);
  if (scope.kind === "subscription" && scope.subsAccId) form.set("subs_acc_id", scope.subsAccId);
  if (scope.agent) form.set("agent", scope.agent);
  form.set("name", name);
  form.set("body", body);
  const res = await fetch("/api/admin/skills", { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorCode(res));
}

export async function uploadSharedSkillZip(scope: ScopeRef, name: string, file: File): Promise<void> {
  const form = new FormData();
  form.set("scope", scope.kind);
  form.set("tenant_id", scope.tenantId);
  if (scope.kind === "subscription" && scope.subsAccId) form.set("subs_acc_id", scope.subsAccId);
  if (scope.agent) form.set("agent", scope.agent);
  form.set("name", name);
  form.set("file", file, file.name);
  const res = await fetch("/api/admin/skills", { method: "POST", body: form });
  if (!res.ok) throw new Error(await errorCode(res));
}

// URL for a shared-skill zip download (bytes stream back through the BFF).
// Used as an <a href> so the browser handles the save.
export function sharedSkillArchiveUrl(scope: ScopeRef, name: string): string {
  const q = scopeParams(scope);
  q.set("name", name);
  return `/api/admin/skills/archive?${q.toString()}`;
}

export async function deleteSharedSkill(scope: ScopeRef, name: string): Promise<void> {
  const q = scopeParams(scope);
  q.set("name", name);
  const res = await fetch(`/api/admin/skills?${q.toString()}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await errorCode(res));
}

