import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// Streams one uploaded file back for download. Forwards to the proxy's
// GET /<role>/v1/media?path=<file> (the download branch) with the
// session JWT and pipes the binary body through.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const role = p.get("role");
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const path = p.get("path");
  if (!role || !isInstance(role) || !tenantId || !subsAccId || !path) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId, path });
  // agent-projects: forwarded by hand here. This route streams a binary body, so it
  // cannot go through `proxyRead` — and without this line every download from a
  // project's files panel, and every `[anexo: ...]` chip in a project conversation,
  // read the MAIN workspace and 404'd.
  const project = p.get("project");
  if (project) query.set("project", project);
  let res: Response;
  try {
    res = await fetchMycelium(`/${role}/v1/media?${query.toString()}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    });
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }

  if (res.status === 401) {
    await clearSession();
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }
  if (!res.ok) {
    const { error, status } = await upstreamError(res);
    return NextResponse.json({ error, status }, { status });
  }

  const headers = new Headers();
  const contentType = res.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const disposition = res.headers.get("content-disposition");
  if (disposition) headers.set("content-disposition", disposition);
  return new NextResponse(res.body, { status: 200, headers });
}
