import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJsonAgent, requireSession } from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const agent = typeof body?.agent === "string" ? body.agent : null;
  const name = req.nextUrl.searchParams.get("name");
  const status = body?.status;
  if (!agent || !isInstance(agent) || !name || !["active", "disabled"].includes(status)) {
    // "deprecated" is not settable here: retiring a model needs a replacement and
    // goes through /models/deprecate.
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, `/models/${encodeURIComponent(name)}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, version: body.version }),
  });
}
