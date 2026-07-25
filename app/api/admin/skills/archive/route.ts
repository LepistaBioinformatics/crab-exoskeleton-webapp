import { NextRequest, NextResponse } from "next/server";
import { forwardAdmin, requireSession } from "@/lib/adminProxy";
import { upstreamError } from "@/lib/mycelium";

// Download a shared skill as a zip. Mirrors
// app/api/admin/shared/content/route.ts: streams the upstream body back
// verbatim (bytes, not JSON), preserving Content-Type and
// Content-Disposition so the browser saves it with the right name.
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const scope = p.get("scope");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const agent = p.get("agent");
  const name = p.get("name");
  if ((scope !== "tenant" && scope !== "subscription") || !tenantId || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (scope === "subscription" && !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({ scope, tenant_id: tenantId, name });
  if (scope === "subscription" && subsAccId) query.set("subs_acc_id", subsAccId);
  if (agent) query.set("agent", agent);

  const out = await forwardAdmin(session, `/skills/archive?${query.toString()}`, { method: "GET" });
  if (out instanceof NextResponse) return out;
  if (!out.ok) {
    const { error, status } = await upstreamError(out);
    return NextResponse.json({ error, status }, { status });
  }

  const headers = new Headers();
  const ct = out.headers.get("content-type");
  if (ct) headers.set("content-type", ct);
  const cd = out.headers.get("content-disposition");
  headers.set("content-disposition", cd ?? `attachment; filename="${name}.zip"`);
  const cl = out.headers.get("content-length");
  if (cl) headers.set("content-length", cl);

  return new NextResponse(out.body, { status: 200, headers });
}
