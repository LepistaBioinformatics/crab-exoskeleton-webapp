import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";
import type { SessionCookie } from "@/lib/session";

// BFF for the proxy's member restart surface (restart-control FR-7). GET reports
// whether this member's instance still needs a bounce -- and when an admin
// scheduled one -- and POST performs it for the caller's own container only.
//
// Which workspace is restarted is decided entirely by the proxy, from the
// mycelium profile plus the routed agent: tenant_id/subs_acc_id here only select
// the workspace the caller is asking ABOUT, and a user id is never sent (nor
// would the proxy read one). `role` picks the gateway service path.
async function callRestart(
  session: SessionCookie,
  role: string,
  suffix: string,
  init: RequestInit,
): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetchMycelium(`/${role}/v1/restart${suffix}`, {
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

// workspaceQuery reads the three params both verbs need, or null when the
// combination is unusable (mapped to a 400 by the callers).
function workspaceQuery(req: NextRequest): { role: string; query: string } | null {
  const p = req.nextUrl.searchParams;
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const role = p.get("role");
  if (!tenantId || !subsAccId || !role || !isInstance(role)) return null;
  return {
    role,
    query: `?${new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId }).toString()}`,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  const target = workspaceQuery(req);
  if (!target) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return callRestart(session, target.role, target.query, { method: "GET" });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  const target = workspaceQuery(req);
  if (!target) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // No body: there is nothing for the client to say about WHICH container to
  // restart, and accepting a field here would invite one.
  return callRestart(session, target.role, target.query, { method: "POST" });
}
