import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// Shared BFF plumbing for the proxy's read-only member routes.
//
// The parts that must NOT drift between features are the security-relevant ones,
// which is why they live here once rather than being copied per feature: `role`
// selects the gateway service path and is never forwarded upstream,
// `tenant_id`/`subs_acc_id` are forwarded and are what the proxy authorizes
// against, and a 401 clears the session rather than surfacing as a generic
// failure.

/** Query parameters a route forwards upstream, beyond tenant/subs. */
export type PassThrough = readonly string[];

/**
 * GET one of the proxy's read routes on behalf of the signed-in member.
 *
 * `upstreamPath` receives the validated role and returns the full gateway path,
 * so each feature owns its own route shape while sharing everything above.
 */
export async function proxyRead(
  req: NextRequest,
  upstreamPath: (role: string) => string,
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
    res = await fetchMycelium(`${upstreamPath(role)}?${query.toString()}`, {
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
