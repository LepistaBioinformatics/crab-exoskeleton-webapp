import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJsonAgent, requireSession } from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

// Assign a registered model to one specific user (admin), for the given agent.
export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const agent = typeof body?.agent === "string" ? body.agent : null;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;
  const subsAccId = typeof body?.subs_acc_id === "string" ? body.subs_acc_id : null;
  const userAccId = typeof body?.user_acc_id === "string" ? body.user_acc_id : null;
  const provider = typeof body?.provider === "string" ? body.provider : null;
  const name = typeof body?.name === "string" ? body.name : null;
  if (!agent || !isInstance(agent) || !tenantId || !subsAccId || !userAccId || !provider || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, "/registered-models/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tenant_id: tenantId,
      subs_acc_id: subsAccId,
      user_acc_id: userAccId,
      provider,
      name,
    }),
  });
}
