import type { Workspace } from "@/app/chat/fragment";
import { errorCode } from "@/lib/i18n/errors";

// Client wrapper for the workspace-memory file (MEMORY_CUSTOM.md), a document
// the user edits directly for the agent to read at turn time. Goes through the
// BFF (/api/memory), which attaches the session and picks the gateway path by
// role.

// A 413 here is an over-long note, not an over-large file.
async function memoryErrorCode(res: Response): Promise<string> {
  return res.status === 413 ? "note_too_long" : errorCode(res);
}

export async function readMemory(workspace: Workspace): Promise<string> {
  const query = withProject(new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
  }), workspace);
  const res = await fetch(`/api/memory?${query.toString()}`);
  if (!res.ok) throw new Error(await memoryErrorCode(res));
  const data = await res.json();
  return typeof data.content === "string" ? data.content : "";
}

export async function writeMemory(workspace: Workspace, content: string): Promise<void> {
  const res = await fetch(`/api/memory`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: workspace.t,
      subs_acc_id: workspace.s,
      role: workspace.r,
      ...(workspace.p ? { project: workspace.p } : {}),
      content,
    }),
  });
  if (!res.ok) throw new Error(await memoryErrorCode(res));
}

// agent-projects: appends the project so the proxy resolves the project's own
// workspace directory instead of the agent's. Absent for a project-less view,
// which keeps every existing request byte-identical.
function withProject(query: URLSearchParams, workspace: Workspace): URLSearchParams {
  if (workspace.p) query.set("project", workspace.p);
  return query;
}
