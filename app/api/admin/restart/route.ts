import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// Admin restart notices (restart-control FR-8): read what a scope currently has
// pending, raise/schedule/execute one, or withdraw it. Authorization (caller
// tier vs target scope) is enforced in the proxy from the injected profile --
// this BFF only forwards the session JWT and surfaces the real status.
//
// Unlike the shared-content routes these are NOT `?scope=tenant|subscription`:
// the proxy infers the scope kind from whether subs_acc_id is present, matching
// the shape of the notice record itself.
const MODES = ["now", "notice", "schedule"];

function scopeQuery(p: URLSearchParams): string | null {
  const tenantId = p.get("tenantId") ?? p.get("tenant_id");
  if (!tenantId) return null;
  const q = new URLSearchParams({ tenant_id: tenantId });
  const subsAccId = p.get("subsAccId") ?? p.get("subs_acc_id");
  const agent = p.get("agent") ?? p.get("agent_key");
  if (subsAccId) q.set("subs_acc_id", subsAccId);
  if (agent) q.set("agent_key", agent);
  return q.toString();
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const query = scopeQuery(req.nextUrl.searchParams);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return proxyAdminJson(session, `/restart?${query}`, { method: "GET" });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : null;
  const mode = typeof body?.mode === "string" ? body.mode : null;
  if (!tenantId || !mode || !MODES.includes(mode)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // `at` is only validated for shape here -- the proxy owns the real rule (must
  // be future, within 7 days) so the two cannot drift apart.
  if (mode === "schedule" && typeof body?.at !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const payload: Record<string, string> = { tenant_id: tenantId, mode };
  if (typeof body?.subsAccId === "string" && body.subsAccId) payload.subs_acc_id = body.subsAccId;
  if (typeof body?.agent === "string" && body.agent) payload.agent_key = body.agent;
  if (typeof body?.at === "string" && body.at) payload.at = body.at;
  if (typeof body?.note === "string" && body.note) payload.note = body.note;
  if (typeof body?.reason === "string" && body.reason) payload.reason = body.reason;

  return proxyAdminJson(session, "/restart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const query = scopeQuery(req.nextUrl.searchParams);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return proxyAdminJson(session, `/restart?${query}`, { method: "DELETE" });
}
