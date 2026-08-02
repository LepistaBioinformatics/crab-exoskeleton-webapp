import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// Shared BFF plumbing for the uploads-tree write operations (create folder, move,
// delete folder).
//
// Same contract as every other proxy-bound route here: the session JWT is attached at
// this layer, `role` selects the gateway service path and is NOT forwarded, and
// tenant/subs travel in the body for the proxy to authorize against.
//
// Upstream statuses are passed through rather than flattened, because the interface
// distinguishes them: 409 is "that name is taken", 400 is "that move is not legal",
// 404 is "it is already gone". Collapsing them to one error would make a drag that
// lands badly indistinguishable from a bug.
export async function proxyMediaWrite(
  req: NextRequest,
  method: "POST" | "DELETE",
  suffix: string,
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  let body: { role?: unknown; [k: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { role, ...forwarded } = body;
  if (typeof role !== "string" || !isInstance(role)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetchMycelium(`/${role}${suffix}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(forwarded),
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
  return NextResponse.json(await res.json().catch(() => ({})));
}
