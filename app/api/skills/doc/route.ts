import { NextRequest, NextResponse } from "next/server";
import {
  fetchMycelium,
  isInstance,
  MyceliumConnectivityError,
  skillsError,
} from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// One file of a skill, for the detail view and for the editor to open on.
//
// `path` names which file and is optional: absent, the proxy answers with SKILL.md,
// which is what this route did before a skill was browsable as a directory. It is
// forwarded only when the caller named one, so the default stays the proxy's.
//
// A READ, AND STILL NOT ON `lib/proxyRead.ts`. Its one job beyond what is written
// here is forwarding the project on every route it serves, which this surface must
// not do (backend DEC-5, and the sibling route's comment for the whole argument).
// What the helper otherwise guarantees is restated below rather than imported: the
// role picks the gateway service path and stops here, tenant and subscription are
// what the proxy authorizes against, and a 401 clears the session.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const role = p.get("role");
  const name = p.get("name");
  const filePath = p.get("path");
  if (!tenantId || !subsAccId || !role || !isInstance(role) || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    name,
    ...(filePath ? { path: filePath } : {}),
  });

  let res: Response;
  try {
    res = await fetchMycelium(`/${role}/v1/skills/doc?${query.toString()}`, {
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
    const { error, status } = skillsError(res);
    return NextResponse.json({ error, status }, { status });
  }
  return NextResponse.json(await res.json());
}
