import type { Workspace } from "@/app/chat/fragment";
import { errorCode } from "@/lib/i18n/errors";

// The client half of the workspace-scoped BFF routes, matching lib/proxyRead.ts on the
// server side. Both halves are shared for the same reason: the query a route is called
// with and the query it validates have to agree, and two copies of either drift.

/** tenant/subs/role, plus whatever else a route takes. `role` selects the gateway path. */
export function workspaceQuery(
  workspace: Workspace,
  extra: Record<string, string> = {},
): string {
  return new URLSearchParams({
    tenant_id: workspace.t,
    subs_acc_id: workspace.s,
    role: workspace.r,
    ...extra,
  }).toString();
}

/**
 * GET a BFF route, throwing a stable error CODE rather than a message — callers render
 * it through `errorText` so the wording stays in the dictionaries.
 */
export async function getJson<T>(path: string, query: string): Promise<T> {
  const res = await fetch(`${path}?${query}`);
  if (!res.ok) throw new Error(await errorCode(res));
  return (await res.json()) as T;
}
