import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// Per-project mutations. Split from ../route.ts because the id is a path
// segment upstream (/v1/projects/<id>), matching the gateway's /v1/projects/*
// wildcard block.

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  const { id } = await params;

  let body: { name?: unknown; instructions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Only the fields actually present are forwarded: upstream treats an absent
  // key as "leave alone", so sending both would overwrite the instructions with
  // an empty string on a plain rename.
  const patch: Record<string, string> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.instructions === "string") patch.instructions = body.instructions;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  return forward(
    `/${r.role}/v1/projects/${encodeURIComponent(id)}?${r.query.toString()}`,
    r.session.token,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const r = await resolve(req);
  if ("error" in r) return r.error;
  const { id } = await params;
  return forward(
    `/${r.role}/v1/projects/${encodeURIComponent(id)}?${r.query.toString()}`,
    r.session.token,
    { method: "DELETE" },
  );
}
