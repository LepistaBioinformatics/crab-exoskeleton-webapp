import { ALL_AGENTS } from "@/lib/admin";
import type { RestartPolicy } from "@/lib/restartPolicy";

// The admin restart surface (restart-control FR-5.1/5.2/5.3, consumed by
// FR-8.3). Distinct from lib/restart.ts, which is the MEMBER surface: that one
// acts on the caller's own workspace and takes no target, because the proxy
// builds the workspace key from the authenticated profile and ignores any id in
// the request (FR-1.1). These three address a scope instead, and are authorized
// by authority-over-target rather than by identity.

// A notice is per scope, not per person: it says "everything under here needs a
// bounce", and each member's own marker decides whether they are still pending.
export interface RestartNotice {
  /** When the change that needs a bounce was applied. RFC3339 UTC. */
  noticeAt: string;
  /** Set only for a schedule: when the proxy will bounce the scope itself. */
  scheduledAt?: string;
  /** The proxy ships the enum, never a sentence — the phrasing lives here. */
  reason: string;
  note?: string;
  /** The requesting admin's email, for traceability. */
  by?: string;
}

export interface RestartTarget {
  tenantId: string;
  subsAccId?: string;
  /** One agent, or absent for the scope-wide record. */
  agent?: string;
}

// ALL_AGENTS addresses the scope-wide store; it is not an agent key. Forwarding it
// would make the proxy look for a record filed under an agent literally named "all"
// and report the scope as clean while a scope-wide notice sits unread.
//
// Still reachable, and so still stripped: the admin screen no longer WRITES to that
// store, but it lists and deletes from it through the legacy entry, and a delete
// bounces the same containers a write would have.
function targetQuery(target: RestartTarget): string {
  const q = new URLSearchParams({ tenantId: target.tenantId });
  if (target.subsAccId) q.set("subsAccId", target.subsAccId);
  if (target.agent && target.agent !== ALL_AGENTS) q.set("agent", target.agent);
  return q.toString();
}

// Same sentinel rule for the body, which the BFF maps to agent_key.
export function restartBody(target: RestartTarget, policy: RestartPolicy): Record<string, string> {
  const body: Record<string, string> = { tenantId: target.tenantId, mode: policy.mode };
  if (target.subsAccId) body.subsAccId = target.subsAccId;
  if (target.agent && target.agent !== ALL_AGENTS) body.agent = target.agent;
  // The proxy takes an instant; the picker gives a local "YYYY-MM-DDTHH:mm".
  if (policy.mode === "schedule" && policy.at) {
    const when = new Date(policy.at);
    if (!Number.isNaN(when.getTime())) body.at = when.toISOString();
  }
  if (policy.note) body.note = policy.note;
  // `reason` is deliberately absent: an admin acting outside a save has no
  // content-derived cause, and the proxy records admin-request for exactly that.
  return body;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? String(res.status));
  }
  return res.json().catch(() => ({}));
}

/** The notice recorded at exactly this scope, or null when there is none. */
export async function getRestartNotice(target: RestartTarget): Promise<RestartNotice | null> {
  const data = (await request(`/api/admin/restart?${targetQuery(target)}`)) as {
    notice?: RestartNotice | null;
  };
  return data.notice ?? null;
}

/** Raises, reschedules or executes a restart, per the policy's mode. */
export async function requestRestart(target: RestartTarget, policy: RestartPolicy): Promise<void> {
  await request("/api/admin/restart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(restartBody(target, policy)),
  });
}

/** Withdraws a pending notice or schedule. */
export async function withdrawRestart(target: RestartTarget): Promise<void> {
  await request(`/api/admin/restart?${targetQuery(target)}`, { method: "DELETE" });
}

// Exported for the test: the query shape is the whole contract with the BFF.
export const __testing = { targetQuery };
