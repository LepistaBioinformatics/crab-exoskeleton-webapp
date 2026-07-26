import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJsonAgent, requireSession } from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

async function forward(req: NextRequest, method: "POST" | "DELETE") {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const agent = typeof body?.agent === "string" ? body.agent : null;
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;
  const subsAccId = typeof body?.subs_acc_id === "string" ? body.subs_acc_id : null;
  const userAccId = typeof body?.user_acc_id === "string" ? body.user_acc_id : null;
  if (!agent || !isInstance(agent) || !tenantId || !subsAccId || !userAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const payload: Record<string, unknown> = {
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    user_acc_id: userAccId,
  };
  if (method === "POST") {
    if (typeof body?.model_name !== "string" || !body.model_name) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    payload.model_name = body.model_name;
  }
  return proxyAdminJsonAgent(session, agent, "/model-assignments", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export const POST = (req: NextRequest) => forward(req, "POST");
export const DELETE = (req: NextRequest) => forward(req, "DELETE");
