import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// resume-turn-after-reload: is a turn still running for this conversation?
//
// A page reload loses the SSE stream but not the turn — the proxy runs it on a
// background context so a disconnect cannot cut it. Without this the client has
// no way to tell "still working" from "finished while I was away" and can only
// guess from silence.
//
// No `project` is forwarded, unlike history/route.ts. The proxy keys its
// in-flight registry by tenant/subs/agent/user and NOT by workspace segment, so
// a project conversation registers under the same scope as a main one and is
// told apart by session id alone. Sending it would read as a guarantee that the
// upstream does not make.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instance: string }> },
) {
  const { instance } = await params;
  if (!isInstance(instance)) {
    return NextResponse.json({ error: "invalid_instance" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  const subsAccId = req.nextUrl.searchParams.get("subs_acc_id");
  if (!sessionId || !tenantId || !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({
    session_id: sessionId,
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
  });

  let res: Response;
  try {
    res = await fetchMycelium(`/${instance}/v1/turns/active?${query.toString()}`, {
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

  const data = (await res.json()) as { active?: unknown };
  return NextResponse.json({ active: data.active === true });
}
