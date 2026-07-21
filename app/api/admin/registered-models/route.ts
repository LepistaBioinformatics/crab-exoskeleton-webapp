import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJsonAgent, requireSession } from "@/lib/adminProxy";
import { isInstance } from "@/lib/mycelium";

// Per-agent model registry (admin): list / register / delete model definitions
// (+ keys) for one agent. `agent` picks which picoclaw service the request is
// routed through, so alpha and beta keep separate registries.
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const agent = req.nextUrl.searchParams.get("agent");
  if (!agent || !isInstance(agent)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, "/registered-models", { method: "GET" });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const body = await req.json().catch(() => null);
  const agent = typeof body?.agent === "string" ? body.agent : null;
  const provider = typeof body?.provider === "string" ? body.provider : null;
  const name = typeof body?.name === "string" ? body.name : null;
  const model = typeof body?.model === "string" ? body.model : null;
  const apiBase = typeof body?.api_base === "string" ? body.api_base : null;
  const apiKey = typeof body?.api_key === "string" ? body.api_key : null;
  if (!agent || !isInstance(agent) || !provider || !name || !model || !apiBase || !apiKey) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return proxyAdminJsonAgent(session, agent, "/registered-models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, name, model, api_base: apiBase, api_key: apiKey }),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const p = req.nextUrl.searchParams;
  const agent = p.get("agent");
  const provider = p.get("provider");
  const name = p.get("name");
  if (!agent || !isInstance(agent) || !provider || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const q = new URLSearchParams({ provider, name });
  return proxyAdminJsonAgent(session, agent, `/registered-models?${q.toString()}`, { method: "DELETE" });
}
