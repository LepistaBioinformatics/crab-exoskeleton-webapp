import { NextRequest, NextResponse } from "next/server";
import { adminScopeQuery, isAdminScope, proxyAdminJson, requireSession } from "@/lib/adminProxy";

// One injected identity file's text, for loading the editor. A 404 from the proxy
// is passed through untouched: it means nothing is injected at this scope, which the
// panel renders as "inherited" rather than as a failure.

const PERSONA_FILES = ["AGENT.md", "SOUL.md", "HEARTBEAT.md", "USER.md"];

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const scope = p.get("scope");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const agent = p.get("agent");
  const name = p.get("name");
  if (!isAdminScope(scope) || !tenantId || !agent || !name || !PERSONA_FILES.includes(name)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const query = adminScopeQuery(scope, tenantId, subsAccId, agent);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  query.set("name", name);

  return proxyAdminJson(session, `/persona/doc?${query.toString()}`, { method: "GET" });
}
