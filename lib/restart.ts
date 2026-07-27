// Client-side view of the proxy's restart-control surface (restart-control
// FR-7). The proxy ships a reason ENUM rather than a sentence, so the phrasing
// lives here where it can be read and changed without a backend deploy.

export const RESTART_REASONS = [
  "shared-secret",
  "shared-skills",
  "shared-files",
  "model",
  "own-secret",
  "admin-request",
] as const;

export type RestartReason = (typeof RESTART_REASONS)[number];

export interface RestartStatus {
  pending: boolean;
  reason?: RestartReason;
  note?: string;
  noticeAt?: string;
  // Set when an administrator scheduled the restart. Its presence is what turns
  // the banner from actionable into informational: the proxy will do it.
  scheduledAt?: string;
  lastRestartAt?: string;
  running: boolean;
}

// What the member is told. Deliberately phrased as a consequence ("to pick up
// ...") rather than a mechanism, because the reason exists to help them decide
// whether to restart now or finish what they were saying.
const REASON_TEXT: Record<RestartReason, string> = {
  "shared-secret": "An administrator changed a shared credential.",
  "shared-skills": "An administrator changed the shared skills.",
  "shared-files": "An administrator changed the shared files.",
  model: "The model behind your assistant changed.",
  "own-secret": "You saved a secret. It applies after a restart.",
  "admin-request": "An administrator asked for a restart.",
};

export function reasonText(reason: string | undefined): string {
  if (reason && (RESTART_REASONS as readonly string[]).includes(reason)) {
    return REASON_TEXT[reason as RestartReason];
  }
  // An unknown reason means the proxy grew a new enum value this build has not
  // learned yet. Say the true, useful part rather than nothing.
  return "Your assistant needs a restart to pick up a recent change.";
}

// Formats an RFC3339 instant in the viewer's own locale and zone. The proxy
// always sends UTC and the browser owns the conversion, so there is no relative
// arithmetic against a server clock anywhere.
export function formatScheduled(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export interface WorkspaceRef {
  t: string;
  s: string;
  r: string;
}

function query(ws: WorkspaceRef): string {
  return new URLSearchParams({ tenant_id: ws.t, subs_acc_id: ws.s, role: ws.r }).toString();
}

export async function fetchRestartStatus(ws: WorkspaceRef): Promise<RestartStatus> {
  const res = await fetch(`/api/restart?${query(ws)}`);
  if (!res.ok) throw new Error(await errorText(res));
  return (await res.json()) as RestartStatus;
}

export async function restartInstance(ws: WorkspaceRef): Promise<{ status: string }> {
  const res = await fetch(`/api/restart?${query(ws)}`, { method: "POST" });
  if (!res.ok) throw new Error(await errorText(res));
  return (await res.json()) as { status: string };
}

// The BFF normalizes failures to {error}. Surface the real reason -- "could not
// restart" with no cause is the least useful thing to show someone whose
// assistant is stuck.
async function errorText(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const raw = typeof body?.error === "string" ? body.error : null;
  if (raw === "session_expired") return "Your session expired. Sign in again.";
  if (raw === "connectivity") return "Could not reach the agent service.";
  return raw ?? `Restart failed (${res.status}).`;
}
