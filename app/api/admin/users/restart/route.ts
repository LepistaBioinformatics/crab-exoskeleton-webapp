import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// Restart ONE member's instance on an admin's behalf.
//
// Distinct from /api/restart, which restarts the CALLER's own instance, and from
// /api/admin/restart, which bounces a whole scope. This one exists because a
// workspace with a broken config.json may not boot picoclaw at all, so its member
// cannot reach their own restart button — and an admin who just repaired that file
// otherwise has no way to put the repair in effect.
//
// `agent` names the target instance and is required, for the same reason as the
// config route: every admin call here is routed through /alpha/v1/admin, so a
// target inherited from the vehicle would bounce the wrong agent's container.
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const userAccId = p.get("user_acc_id");
  const agent = p.get("agent");
  if (!tenantId || !subsAccId || !userAccId || !agent) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    user_acc_id: userAccId,
    agent,
  });
  return proxyAdminJson(session, `/users/restart?${query.toString()}`, { method: "POST" });
}
