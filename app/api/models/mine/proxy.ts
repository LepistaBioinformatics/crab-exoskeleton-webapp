import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// Shared plumbing for the three /api/models/mine routes. One place, because the
// three carry the same session handling and the same rule about where a key may
// travel — and three copies of that rule is three chances to weaken one.

export interface WorkspaceParams {
  tenantId: string;
  subsAccId: string;
  role: string;
}

export function workspaceFromQuery(req: NextRequest): WorkspaceParams | null {
  const p = req.nextUrl.searchParams;
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const role = p.get("role");
  if (!tenantId || !subsAccId || !role || !isInstance(role)) return null;
  return { tenantId, subsAccId, role };
}

// callUserModels forwards to `/{role}/v1/models/mine…` with the session's bearer
// token attached here, never in the browser.
export async function callUserModels(
  role: string,
  suffix: string,
  init: RequestInit,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  let res: Response;
  try {
    res = await fetchMycelium(`/${role}/v1/models/mine${suffix}`, {
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
    // The proxy's own reason survives: "bad_key" and "blocked_target" are the
    // difference between "fix your credential" and "that address is refused",
    // and a masked connectivity error would tell the member neither.
    const { error, status } = await upstreamError(res);
    return NextResponse.json({ error, status }, { status });
  }
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data);
}

type ParsedBody =
  | { error: NextResponse }
  | { role: string; query: URLSearchParams; body: Record<string, unknown> };

// userModelBody validates the envelope and rebuilds the payload field by field.
// Forwarding the parsed body wholesale would pass through anything the client
// chose to add — including an owner or an enabled flag, neither of which a member
// may set.
export async function userModelBody(req: NextRequest): Promise<ParsedBody> {
  const body = await req.json().catch(() => null);
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;
  const subsAccId = typeof body?.subs_acc_id === "string" ? body.subs_acc_id : null;
  const role = typeof body?.role === "string" ? body.role : null;
  if (!tenantId || !subsAccId || !role || !isInstance(role)) {
    return { error: NextResponse.json({ error: "invalid_request" }, { status: 400 }) };
  }

  const out: Record<string, unknown> = {};
  for (const field of ["slug", "label", "provider", "model", "api_base"] as const) {
    if (typeof body?.[field] === "string") out[field] = body[field];
  }
  // Absent means "keep the stored key"; the proxy owns that rule, so the BFF
  // must not invent an empty string here.
  if (typeof body?.api_key === "string" && body.api_key !== "") out.api_key = body.api_key;
  if (body?.extra_body !== undefined) out.extra_body = body.extra_body;
  // The optimistic version the form was opened on. Forwarded as a number or not
  // at all — the proxy reads 0 as "no check", so a malformed one must not
  // silently become that.
  if (typeof body?.version === "number") out.version = body.version;
  if (typeof body?.slug === "string") out.slug = body.slug;

  return {
    role,
    // role is a routing detail (the path); the proxy takes the workspace pair
    // from the query string, as every other member route does.
    query: new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId }),
    body: out,
  };
}
