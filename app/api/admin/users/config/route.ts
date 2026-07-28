import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession, restartParams, withRestart } from "@/lib/adminProxy";

// One member instance's config.json: read (GET) and replace (PUT).
//
// This is NOT the private-file content route `users/files/route.ts` forbids, and
// that instruction stands unchanged. The distinction:
//
//   - FR-7's subject is the set the proxy's ListUserFiles enumerates, which is
//     the member's UPLOADS dir alone. config.json is not in it.
//   - FR-7 protects MEMBER-AUTHORED content. config.json is proxy-materialized
//     provisioning state at the workspace root: the proxy seeds it and rewrites
//     six of its paths on every materialization.
//   - This route takes no file name and can address nothing but config.json.
//     Do not add one.
//
// `agent` is REQUIRED and names the target agent. It is not the routing vehicle:
// every admin call here goes through /alpha/v1/admin, so a target inherited from
// the vehicle would edit alpha's config while the admin believes they are fixing
// beta's.
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

  return proxyAdminJson(session, `/users/config?${query.toString()}`, { method: "GET" });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const query = instanceQuery(req);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  // The body ({raw, revision}) is forwarded verbatim: the proxy owns every rule
  // about it (parses as an object, size cap, revision match), and a second copy
  // of those rules here would drift.
  const body = await req.text();
  return proxyAdminJson(
    session,
    withRestart(`/users/config?${query.toString()}`, restartParams(req)),
    { method: "PUT", body, headers: { "Content-Type": "application/json" } },
  );
}
