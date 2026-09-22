import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// The bytes of a file somebody published into the mangrove.
//
// A ROUTE OF ITS OWN, BESIDE `[action]` AND NOT INSIDE IT. Every other mangrove call
// is JSON in and JSON out, and that route reads the answer with `res.json()` before
// re-serializing it — which would turn a PDF into a parse error. This one pipes
// `res.body` straight through, exactly as `/api/media/download` does for a
// workspace file. A static segment wins over a dynamic sibling, so `blob` never
// reaches the action router; and if it somehow did, `blob` is not in its closed
// ACTIONS map and it would refuse rather than mangle anything.
//
// THE PROXY'S HEADERS ARE THE SAFE ONES AND THEY ARE FORWARDED AS GIVEN:
// `application/octet-stream`, `Content-Disposition: attachment` and
// `X-Content-Type-Options: nosniff` are what keep another tenant's file from
// rendering as a document from this app's origin. Widening the content type here
// would spend exactly that.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const role = p.get("role");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const blob = p.get("blob");
  if (!role || !isInstance(role) || !tenantId || !subsAccId || !blob) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId, blob });
  let res: Response;
  try {
    res = await fetchMycelium(`/${role}/v1/mangrove/blob?${query.toString()}`, {
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
  if (res.status === 404) {
    // Two things arrive as a 404 here and they are NOT the same: the mangrove is
    // switched off, or this member cannot see that blob. The download control only
    // renders on a timeline the mangrove itself served, so by the time anybody can
    // press it the feature is known to be on — which makes `mangrove_off` the wrong
    // sentence and a plain miss the right one.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (!res.ok) {
    const { error, status } = await upstreamError(res);
    return NextResponse.json({ error, status }, { status });
  }

  const headers = new Headers();
  for (const name of ["content-type", "content-disposition", "content-length", "x-content-type-options"]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(res.body, { status: 200, headers });
}
