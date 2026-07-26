import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJsonAgent, requireSession } from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const agent = typeof body?.agent === "string" ? body.agent : null;
  const name = typeof body?.name === "string" ? body.name : null;
  const replacedBy = typeof body?.replaced_by === "string" ? body.replaced_by : null;
  if (!agent || !isInstance(agent) || !name || !replacedBy) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, `/models/${encodeURIComponent(name)}/deprecate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replaced_by: replacedBy, version: body.version }),
  });
}
