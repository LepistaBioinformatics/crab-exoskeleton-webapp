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
  // Whether THIS caller may act on the notice. A read-only member sees the
  // banner with canRestart=false; the client cannot infer that, because holding
  // read on an agent says nothing about holding write (FR-7.6).
  //
  // Optional so a webapp deployed ahead of the proxy that added it keeps
  // working: absent is treated as "allowed", which is the pre-field behaviour.
  canRestart?: boolean;
}

// The phrasing lives in the copy catalogue; this only picks the right key. An
// unknown reason means the proxy grew a new enum value this build has not
// learned yet — say the true, useful part rather than nothing.
export function reasonText(
  copy: { reasons: Record<RestartReason, string>; reasonUnknown: string },
  reason: string | undefined,
): string {
  if (reason && (RESTART_REASONS as readonly string[]).includes(reason)) {
    return copy.reasons[reason as RestartReason];
  }
  return copy.reasonUnknown;
}

// Formats an RFC3339 instant in the viewer's own locale and zone. The proxy
// always sends UTC and the browser owns the conversion, so there is no relative
// arithmetic against a server clock anywhere.
export function formatScheduled(iso: string, locale?: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return iso;
  return when.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
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

// The BFF normalizes failures to {error}. The raw code is thrown as-is so the
// component can look it up in the copy catalogue; anything else is already a
// message from the proxy and is surfaced verbatim -- "could not restart" with no
// cause is the least useful thing to show someone whose assistant is stuck.
async function errorText(res: Response): Promise<string> {
  const body = await res.json().catch(() => null);
  const raw = typeof body?.error === "string" ? body.error : null;
  return raw ?? `restart_failed_${res.status}`;
}
