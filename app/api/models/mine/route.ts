import { NextRequest, NextResponse } from "next/server";
import { callUserModels, userModelBody, workspaceFromQuery } from "./proxy";

// BFF for the member's own models (user-owned-models). Same shape as
// app/api/secrets/route.ts: session cookie in, bearer out, the proxy's real 4xx
// reason preserved rather than masked as connectivity.
//
// These are crab-shell-proxy routes, so they are REST. The monorepo's "always
// call mycelium over JSON-RPC" rule is about mycelium and does not apply.
//
// api_key travels only in a POST/PUT body — never a query string, so it cannot
// end up in an access log or a Referer header.

export async function GET(req: NextRequest) {
  const ws = workspaceFromQuery(req);
  if (!ws) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const query = new URLSearchParams({ tenant_id: ws.tenantId, subs_acc_id: ws.subsAccId });
  return callUserModels(ws.role, `?${query.toString()}`, { method: "GET" });
}

export async function POST(req: NextRequest) {
  const parsed = await userModelBody(req);
  if ("error" in parsed) return parsed.error;
  return callUserModels(parsed.role, `?${parsed.query.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.body),
  });
}

export async function PUT(req: NextRequest) {
  const parsed = await userModelBody(req);
  if ("error" in parsed) return parsed.error;
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  parsed.query.set("slug", slug);
  return callUserModels(parsed.role, `?${parsed.query.toString()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(parsed.body),
  });
}

export async function DELETE(req: NextRequest) {
  const ws = workspaceFromQuery(req);
  const slug = req.nextUrl.searchParams.get("slug");
  if (!ws || !slug) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const query = new URLSearchParams({
    tenant_id: ws.tenantId,
    subs_acc_id: ws.subsAccId,
    slug,
  });
  return callUserModels(ws.role, `?${query.toString()}`, { method: "DELETE" });
}
