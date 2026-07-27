import { NextRequest, NextResponse } from "next/server";
import {
  proxyAdminJsonAgent,
  requireSession,
  restartParams,
  withRestart,
} from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

// Model inventory (admin). The inventory itself is proxy-wide, but requests are
// still routed through an agent's service because that is how the gateway
// addresses the proxy at all.
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const agent = req.nextUrl.searchParams.get("agent");
  if (!agent || !isInstance(agent)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, "/models", { method: "GET" });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const agent = typeof body?.agent === "string" ? body.agent : null;
  if (!agent || !isInstance(agent) || typeof body?.model_name !== "string" || !body.model_name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { agent: _agent, ...payload } = body;
  return proxyAdminJsonAgent(session, agent, "/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const agent = typeof body?.agent === "string" ? body.agent : null;
  const name = req.nextUrl.searchParams.get("name");
  if (!agent || !isInstance(agent) || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { agent: _agent, name: _name, ...payload } = body;
  // A definition or key edit re-materializes every workspace holding this model;
  // the policy decides whether they bounce now or are told to (FR-4).
  const suffix = withRestart(`/models/${encodeURIComponent(name)}`, restartParams(req));
  return proxyAdminJsonAgent(session, agent, suffix, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const p = req.nextUrl.searchParams;
  const agent = p.get("agent");
  const name = p.get("name");
  if (!agent || !isInstance(agent) || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, `/models/${encodeURIComponent(name)}`, { method: "DELETE" });
}
