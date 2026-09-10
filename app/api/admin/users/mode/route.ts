import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// One member instance's lifecycle mode: read (GET) and set (PUT).
//
// `agents.<key>.mode` in the proxy's config.yaml is the DEFAULT for every
// instance of that agent; this addresses the exception for one of them. The
// reason it exists is scheduled tasks — they run from timers inside the
// container, so a scale-to-zero instance fires none, and without a per-instance
// setting a whole agent has to choose between a permanently running container
// per member and no working schedules at all.
//
// `agent` is REQUIRED and names the TARGET. It is not the routing vehicle: every
// admin call goes through /alpha/v1/admin, so a target inherited from the vehicle
// would change alpha's instance while the admin believes they are changing beta's.
//
// No restart parameters. Unlike users/config, this endpoint's effect is immediate
// and complete on the proxy side — Manager.SetMode moves the idle timer with the
// write — so there is nothing for a bounce to deliver.
function instanceQuery(req: NextRequest): URLSearchParams | null {
  const p = req.nextUrl.searchParams;
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const userAccId = p.get("user_acc_id");
  const agent = p.get("agent");
  if (!tenantId || !subsAccId || !userAccId || !agent) return null;
  return new URLSearchParams({
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    user_acc_id: userAccId,
    agent,
  });
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const query = instanceQuery(req);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return proxyAdminJson(session, `/users/mode?${query.toString()}`, { method: "GET" });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const query = instanceQuery(req);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  // Forwarded verbatim: the proxy owns every rule about the value (the closed
  // set of modes, and the refusal to set scale-to-zero on an agent with no
  // idleTimeout). A second copy of those rules here would drift from it.
  const body = await req.text();
  return proxyAdminJson(session, `/users/mode?${query.toString()}`, {
    method: "PUT",
    body,
    headers: { "Content-Type": "application/json" },
  });
}
