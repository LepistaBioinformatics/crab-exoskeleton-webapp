import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// The model override at a scope, or at a per-user target within a
// subscription (via user_acc_id): current effective selection (GET), set
// (PUT), clear/reset-to-inherited (DELETE). Mirrors
// app/api/admin/skills/route.ts. Provider/name only -- an API key never
// transits this route (CTX-AMO-06).

const SCOPES = ["tenant", "subscription"] as const;
type ScopeKind = (typeof SCOPES)[number];

function isScope(value: unknown): value is ScopeKind {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

// tenant scope needs only tenant_id; subscription scope needs both. An
// optional user_acc_id narrows to a per-user target.
function scopeQuery(
  scope: ScopeKind,
  tenantId: string,
  subsAccId: string | null,
  userAccId: string | null,
): URLSearchParams | null {
  if (scope === "subscription" && !subsAccId) return null;
  const q = new URLSearchParams({ scope, tenant_id: tenantId });
  if (scope === "subscription" && subsAccId) q.set("subs_acc_id", subsAccId);
  if (userAccId) q.set("user_acc_id", userAccId);
  return q;
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const scope = p.get("scope");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const userAccId = p.get("user_acc_id");
  if (!isScope(scope) || !tenantId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const query = scopeQuery(scope, tenantId, subsAccId, userAccId);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return proxyAdminJson(session, `/model?${query.toString()}`, { method: "GET" });
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const {
    scope,
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    user_acc_id: userAccId,
    provider,
    name,
  } = body as Record<string, unknown>;
  if (
    !isScope(scope) ||
    typeof tenantId !== "string" ||
    !tenantId ||
    typeof provider !== "string" ||
    !provider ||
    typeof name !== "string" ||
    !name
  ) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (scope === "subscription" && typeof subsAccId !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (userAccId !== undefined && typeof userAccId !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const upstream: Record<string, unknown> = { scope, tenant_id: tenantId, provider, name };
  if (typeof subsAccId === "string") upstream.subs_acc_id = subsAccId;
  if (typeof userAccId === "string") upstream.user_acc_id = userAccId;

  return proxyAdminJson(session, "/model", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(upstream),
  });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const scope = p.get("scope");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const userAccId = p.get("user_acc_id");
  if (!isScope(scope) || !tenantId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const query = scopeQuery(scope, tenantId, subsAccId, userAccId);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return proxyAdminJson(session, `/model?${query.toString()}`, { method: "DELETE" });
}
