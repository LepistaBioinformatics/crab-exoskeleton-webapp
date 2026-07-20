import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession } from "@/lib/adminProxy";

// Shared skills at a scope (tenant or subscription): list / create-or-replace
// (editor body or zip upload) / delete. Mirrors app/api/admin/shared/route.ts.
// Preview/doc-load is a separate route (text only); download is a separate
// route (streams a zip).

const SCOPES = ["tenant", "subscription"] as const;
type ScopeKind = (typeof SCOPES)[number];

function isScope(value: unknown): value is ScopeKind {
  return typeof value === "string" && (SCOPES as readonly string[]).includes(value);
}

// tenant scope needs only tenant_id; subscription scope needs both.
function scopeQuery(scope: ScopeKind, tenantId: string, subsAccId: string | null): URLSearchParams | null {
  if (scope === "subscription" && !subsAccId) return null;
  const q = new URLSearchParams({ scope, tenant_id: tenantId });
  if (scope === "subscription" && subsAccId) q.set("subs_acc_id", subsAccId);
  return q;
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
  const query = scopeQuery(scope, tenantId, subsAccId);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

  return proxyAdminJson(session, `/skills?${query.toString()}`, { method: "GET" });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const scope = form.get("scope");
  const tenantId = form.get("tenant_id");
  const subsAccId = form.get("subs_acc_id");
  const name = form.get("name");
  const body = form.get("body");
  const file = form.get("file");
  if (!isScope(scope) || typeof tenantId !== "string" || typeof name !== "string" || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (scope === "subscription" && typeof subsAccId !== "string") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const hasBody = typeof body === "string" && body.length > 0;
  const hasFile = file instanceof File;
  if (hasBody === hasFile) {
    // Exactly one of `body` (editor mode) or `file` (zip upload) is required.
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const upstream = new FormData();
  upstream.set("scope", scope);
  upstream.set("tenant_id", tenantId);
  if (scope === "subscription" && typeof subsAccId === "string") {
    upstream.set("subs_acc_id", subsAccId);
  }
  upstream.set("name", name);
  if (hasFile) {
    upstream.set("file", file as File, (file as File).name);
  } else {
    upstream.set("body", body as string);
  }

  // No explicit Content-Type: fetch sets the multipart boundary for a FormData
  // body (same as /api/admin/shared).
  return proxyAdminJson(session, "/skills", { method: "POST", body: upstream });
}

export async function DELETE(req: NextRequest) {
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
  const query = scopeQuery(scope, tenantId, subsAccId);
  if (!query) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  query.set("name", name);

  return proxyAdminJson(session, `/skills?${query.toString()}`, { method: "DELETE" });
}
