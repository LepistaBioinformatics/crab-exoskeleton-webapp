import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// Stop the turn running on a conversation.
//
// Same scope the turn was sent with, and deliberately so: the proxy derives the
// picoclaw session id from these fields, and picoclaw looks the abort up by it.
// Dropping `project` here would address the main agent's session instead and
// stop nothing, while still answering 204 — the shape of defect this repo has
// already met more than once (see the agent-projects specs).
//
// No `message`: a stop carries the scope, not the content.
export async function POST(
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

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.session_id === "string" ? body.session_id : null;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;
  const subsAccId = typeof body?.subs_acc_id === "string" ? body.subs_acc_id : null;
  const project = typeof body?.project === "string" && body.project ? body.project : null;
  if (!sessionId || !tenantId || !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  let res: Response;
  try {
    res = await fetchMycelium(`/${instance}/v1/chat/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        tenant_id: tenantId,
        subs_acc_id: subsAccId,
        ...(project ? { project } : {}),
      }),
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
  // The proxy answers 204 whether or not a turn was actually running: the turn
  // finishing while the member clicks is an ordinary race, not a failure.
  return new NextResponse(null, { status: 204 });
}
