import type { Workspace } from "@/app/chat/fragment";
import { errorCode } from "@/lib/i18n/errors";

// Client wrapper for the proxy's project surface (agent-projects). A project is
// a picoclaw agent of its own — its own workspace, files and AGENT.md —
// inheriting the parent agent's model, skills and credentials.
//
// Everything goes through the BFF (/api/projects), which attaches the session
// and picks the gateway path by role.

export interface Project {
  id: string;
  name: string;
  instructions: string;
  createdAt: string;
}

interface ProjectApiRow {
  id?: unknown;
  name?: unknown;
  instructions?: unknown;
  created_at?: unknown;
}

function fromApiRow(row: ProjectApiRow): Project {
  return {
    id: typeof row.id === "string" ? row.id : "",
    name: typeof row.name === "string" ? row.name : "",
    instructions: typeof row.instructions === "string" ? row.instructions : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

/**
 * Two letters standing in for a project on the collapsed rail, where 48px leaves no
 * room for a name and a column of identical folder glyphs would identify nothing.
 *
 * Two words give their initials ("Field Trial" -> FT); one word gives its first two
 * letters ("Soja" -> SO), because a single letter collides far too readily across a
 * handful of projects. Non-letters are skipped so "2026 — Soy" does not become "2S".
 */
export function projectInitials(name: string): string {
  const words = name
    .split(/[\s_/-]+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + words[1][0];
}

function workspaceQuery(workspace: Workspace): string {
  return new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
  }).toString();
}

// 409 is a name already in use. 501 is an agent that cannot have projects at all —
// no current proxy answers it, since picoclaw is the only harness and it supports
// them, but an older one still can, so the mapping stays. Both are ordinary outcomes
// the UI phrases for the user, not failures — mapping them to a generic error would
// leave someone retyping a name that can never be accepted.
async function projectErrorCode(res: Response): Promise<string> {
  if (res.status === 409) return "project_name_taken";
  if (res.status === 501) return "projects_unsupported";
  return errorCode(res);
}

export async function listProjects(workspace: Workspace): Promise<Project[]> {
  const res = await fetch(`/api/projects?${workspaceQuery(workspace)}`);
  if (!res.ok) throw new Error(await projectErrorCode(res));
  const data = await res.json();
  return Array.isArray(data.projects) ? data.projects.map(fromApiRow) : [];
}

export async function createProject(
  workspace: Workspace,
  name: string,
  instructions: string,
): Promise<Project> {
  const res = await fetch(`/api/projects?${workspaceQuery(workspace)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, instructions }),
  });
  if (!res.ok) throw new Error(await projectErrorCode(res));
  const data = await res.json();
  return fromApiRow(data.project ?? {});
}

// patch carries only the fields being changed: upstream leaves an absent key
// alone, so always sending both would blank the instructions on a rename.
export async function updateProject(
  workspace: Workspace,
  id: string,
  patch: { name?: string; instructions?: string },
): Promise<Project> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(id)}?${workspaceQuery(workspace)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  if (!res.ok) throw new Error(await projectErrorCode(res));
  const data = await res.json();
  return fromApiRow(data.project ?? {});
}

// Deleting removes the project's workspace, its files AND its transcripts. The
// caller is expected to have confirmed that with the user first.
export async function deleteProject(workspace: Workspace, id: string): Promise<void> {
  const res = await fetch(
    `/api/projects/${encodeURIComponent(id)}?${workspaceQuery(workspace)}`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(await projectErrorCode(res));
}
