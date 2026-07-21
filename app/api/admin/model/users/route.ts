import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// Per-user effective model overrides under a subscription (mirror
// app/api/admin/users/route.ts, model-shaped) for the per-user picker in
// model-panel.tsx. Provider/name only -- no key ever transits this route
// (CTX-AMO-06).

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
  if (!isScope(scope) || !tenantId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (scope === "subscription" && !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({ scope, tenant_id: tenantId });
  if (scope === "subscription" && subsAccId) query.set("subs_acc_id", subsAccId);

  return proxyAdminJson(session, `/model/users?${query.toString()}`, { method: "GET" });
}
