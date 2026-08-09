import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJsonAgent, requireSession } from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

// What members registered for themselves, and the administrator's switch over
// one of them (user-owned-models R6).
//
// Read-only plus enable/disable, deliberately: an administrator does not edit
// somebody else's model. They can turn it off, which drops that member back to
// the organisation's model, and the member fixes or removes their own record.
// No response here ever carries a key — the proxy's public shape has no field
// for one.

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const p = req.nextUrl.searchParams;
  const agent = p.get("agent");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  if (!agent || !isInstance(agent) || !tenantId || !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const query = new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId });
  return proxyAdminJsonAgent(session, agent, `/user-models?${query.toString()}`, { method: "GET" });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const agent = typeof body?.agent === "string" ? body.agent : null;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;
  const subsAccId = typeof body?.subs_acc_id === "string" ? body.subs_acc_id : null;
  const ownerAccId = typeof body?.owner_acc_id === "string" ? body.owner_acc_id : null;
  const slug = typeof body?.slug === "string" ? body.slug : null;
  if (
    !agent ||
    !isInstance(agent) ||
    !tenantId ||
    !subsAccId ||
    !ownerAccId ||
    !slug ||
    typeof body?.enabled !== "boolean"
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, "/user-models/status", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId,
      subs_acc_id: subsAccId,
      owner_acc_id: ownerAccId,
      slug,
      enabled: body.enabled,
    }),
  });
}
