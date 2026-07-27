import { NextResponse, type NextRequest } from "next/server";
import { fetchMycelium, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";
import type { SessionCookie } from "@/lib/session";

// Every /v1/admin/* endpoint is agent-agnostic: shared content is stored under
// tenant/subscription scope, not per-role. We still route through a picoclaw
// service so the proxy's resolveAgent bearer guard runs -- alpha is just the
// vehicle (same pattern as /api/subscriptions). Authorization (caller tier vs
// target scope) is enforced server-side in the proxy from the injected profile;
// this BFF only forwards the session JWT and surfaces the real status.
const ADMIN_BASE = "/alpha/v1/admin";

export const ADMIN_SCOPES = ["tenant", "subscription"] as const;
export type AdminScopeKind = (typeof ADMIN_SCOPES)[number];

export function isAdminScope(value: unknown): value is AdminScopeKind {
  return typeof value === "string" && (ADMIN_SCOPES as readonly string[]).includes(value);
}

// The shared-content query every scope-addressed admin route builds: tenant scope
// needs only tenant_id, subscription scope needs both, and `agent` narrows the
// target to one agent ("all", or omitted, addresses the store every agent reads).
// Returns null when the combination is invalid, which callers map to a 400.
export function adminScopeQuery(
  scope: AdminScopeKind,
  tenantId: string,
  subsAccId: string | null,
  agent?: string | null,
): URLSearchParams | null {
  if (scope === "subscription" && !subsAccId) return null;
  const q = new URLSearchParams({ scope, tenant_id: tenantId });
  if (scope === "subscription" && subsAccId) q.set("subs_acc_id", subsAccId);
  if (agent) q.set("agent", agent);
  return q;
}

export async function requireSession(): Promise<SessionCookie | NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  return session;
}

// Forwards to an admin endpoint and returns the upstream response untouched, so
// callers can either JSON it or stream its body (the file-download route). A
// caught connectivity failure and an expired session are normalized to the
// stack-wide error shapes ({error:"connectivity"} / {error:"session_expired"}).
export async function forwardAdmin(
  session: SessionCookie,
  suffix: string,
  init: RequestInit = {},
): Promise<Response | NextResponse> {
  let res: Response;
  try {
    res = await fetchMycelium(`${ADMIN_BASE}${suffix}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${session.token}` },
    });
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }

  if (res.status === 401) {
    await clearSession();
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  return res;
}

// The common case: forward, surface upstream 4xx/5xx, echo the JSON body.
export async function proxyAdminJson(
  session: SessionCookie,
  suffix: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  const out = await forwardAdmin(session, suffix, init);
  if (out instanceof NextResponse) return out;
  if (!out.ok) {
    const { error, status } = await upstreamError(out);
    return NextResponse.json({ error, status }, { status });
  }
  const data = await out.json().catch(() => ({}));
  return NextResponse.json(data);
}

// Agent-aware variant: routes through `/<agent>/v1/admin` so the proxy
// resolves that specific agent. Used by the model registry, which is per-agent
// (alpha and beta keep separate model catalogs). `agent` must be an instance.
export async function proxyAdminJsonAgent(
  session: SessionCookie,
  agent: string,
  suffix: string,
  init: RequestInit = {},
): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetchMycelium(`/${agent}/v1/admin${suffix}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${session.token}` },
    });
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }
  if (res.status === 401) {
    await clearSession();
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  if (!res.ok) {
    const { error, status } = await upstreamError(res);
    return NextResponse.json({ error, status }, { status });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data);
}

// The restart policy travels as query parameters (restart-control FR-4): the
// proxy reads them off the URL so the multipart upload routes (shared files,
// skills) need no body change and a DELETE can carry them too.
//
// This forwards them verbatim rather than validating: the proxy owns the rules
// (known mode, `at` in the future and within 7 days) and duplicating them here
// would let the two drift apart. Absent parameters mean "restart now", which is
// the behaviour every one of these endpoints had before the policy existed.
export function restartParams(req: NextRequest): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of ["restart", "restart_at", "restart_note"]) {
    const v = req.nextUrl.searchParams.get(key);
    if (v) out.set(key, v);
  }
  return out;
}

// withRestart appends the policy to an admin suffix that may already have a
// query string.
export function withRestart(suffix: string, policy: URLSearchParams): string {
  const s = policy.toString();
  if (!s) return suffix;
  return suffix + (suffix.includes("?") ? "&" : "?") + s;
}
