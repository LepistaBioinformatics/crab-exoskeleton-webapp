import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// Shared BFF plumbing for the proxy's read-only knowledge-graph routes
// (/v1/memory-graph*). All four differ only in the path suffix and which extra
// query parameters they pass through, so the session handling, the role→gateway
// path mapping and the error mapping live here once.
//
// Extracted rather than copied four times because the parts that must NOT drift
// are the security-relevant ones: `role` selects the gateway service path and is
// never forwarded upstream, `tenant_id`/`subs_acc_id` are forwarded and are what
// the proxy authorizes against, and a 401 clears the session rather than being
// surfaced as a generic failure.
//
// Distinct from /api/memory, which is MEMORY_CUSTOM.md — a different thing with
// its own route.

/** Query parameters this route forwards upstream, beyond tenant/subs. */
export type PassThrough = readonly string[];

export async function proxyGraphRead(
  req: NextRequest,
  suffix: string,
  passThrough: PassThrough = [],
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const role = p.get("role");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  if (!role || !isInstance(role) || !tenantId || !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Rebuilt rather than forwarded wholesale: `role` must not travel upstream (it
  // is this layer's routing input), and an allowlist means a future parameter is
  // a deliberate addition rather than something a caller can smuggle through.
  const query = new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId });
  for (const name of passThrough) {
    const value = p.get(name);
    if (value !== null && value !== "") query.set(name, value);
  }

  let res: Response;
  try {
    res = await fetchMycelium(`/${role}/v1/memory-graph${suffix}?${query.toString()}`, {
      headers: { Authorization: `Bearer ${session.token}` },
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
