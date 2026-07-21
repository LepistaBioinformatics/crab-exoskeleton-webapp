import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// A shared skill's SKILL.md text + metadata (preview + editor load). JSON
// only -- the zip download is a separate route.

const SCOPES = ["tenant", "subscription"] as const;
type ScopeKind = (typeof SCOPES)[number];

function isScope(value: unknown): value is ScopeKind {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const scope = p.get("scope");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const name = p.get("name");
  if (!isScope(scope) || !tenantId || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (scope === "subscription" && !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({ scope, tenant_id: tenantId, name });
  if (scope === "subscription" && subsAccId) query.set("subs_acc_id", subsAccId);

  return proxyAdminJson(session, `/skills/doc?${query.toString()}`, { method: "GET" });
}
