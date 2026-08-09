import { NextRequest, NextResponse } from "next/server";
import { callUserModels, userModelBody, workspaceFromQuery } from "../proxy";

// Which model this workspace runs: one of the member's own (PUT) or the one
// their administrator provides (DELETE).
//
// Two routes rather than "PUT with an empty slug", so going back to the
// organisation's model cannot happen by accident from a blank form field.

export async function PUT(req: NextRequest) {
  const parsed = await userModelBody(req);
  if ("error" in parsed) return parsed.error;
  const slug = parsed.body.slug;
  if (typeof slug !== "string" || !slug) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  return callUserModels(parsed.role, `/selection?${parsed.query.toString()}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
}

export async function DELETE(req: NextRequest) {
  const ws = workspaceFromQuery(req);
  if (!ws) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const query = new URLSearchParams({ tenant_id: ws.tenantId, subs_acc_id: ws.subsAccId });
  return callUserModels(ws.role, `/selection?${query.toString()}`, { method: "DELETE" });
}
