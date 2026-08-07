import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// BFF for the proxy's project surface (agent-projects). Same shape as
// /api/memory: the browser sends `role` (picks the gateway service path, and is
// NOT forwarded) plus tenant_id/subs_acc_id from the fragment; the session JWT
// is attached here.
//
// The proxy answers 501 for a non-picoclaw harness, 409 on a duplicate name and
// 404 on an unknown id — all real 4xx that upstreamError passes through, so the
// UI can tell "that name is taken" from "that agent cannot have projects".

// Shared preamble: session + the three parameters every call needs.
async function resolve(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return { error: NextResponse.json({ error: "session_expired" }, { status: 401 }) };
  }
  const p = req.nextUrl.searchParams;
  const role = p.get("role");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  if (!role || !isInstance(role) || !tenantId || !subsAccId) {
    return { error: NextResponse.json({ error: "invalid_request" }, { status: 400 }) };
  }
  return {
    session,
    role,
    query: new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId }),
  };
}

// forward runs one upstream call and normalizes the three outcomes the UI cares
// about: lost session, unreachable gateway, and a real upstream 4xx.
async function forward(path: string, token: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetchMycelium(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}` },
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
  return NextResponse.json(await res.json());
}

export async function GET(req: NextRequest) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  return forward(`/${r.role}/v1/projects?${r.query.toString()}`, r.session.token);
}

export async function POST(req: NextRequest) {
  const r = await resolve(req);
  if ("error" in r) return r.error;

  let body: { name?: unknown; instructions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  return forward(`/${r.role}/v1/projects?${r.query.toString()}`, r.session.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: body.name,
      instructions: typeof body.instructions === "string" ? body.instructions : "",
    }),
  });
}
