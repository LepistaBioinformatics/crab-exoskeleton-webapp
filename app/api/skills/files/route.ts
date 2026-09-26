import { NextRequest, NextResponse } from "next/server";
import {
  fetchMycelium,
  isInstance,
  MyceliumConnectivityError,
  skillsError,
} from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// Everything inside one skill.
//
// A skill is a DIRECTORY, and the panel used to say so with a badge and nothing
// else: the member was told templates and scripts existed and could never open
// one. This is the route that makes the badge actionable, and it serves all three
// layers -- an administrator's skill that tells the agent to fill in a template
// cannot be understood while the template is invisible.
//
// THE SAME SHAPE AS `../doc/route.ts`, DELIBERATELY, including not being built on
// `lib/proxyRead.ts`. That helper forwards the project on every route it serves,
// which this surface must not do (backend DEC-5; the sibling routes' comments carry
// the whole argument). What it otherwise guarantees is restated here rather than
// imported: the role picks the gateway service path and stops at this layer, tenant
// and subscription are what the proxy authorizes against, and a 401 clears the
// session.
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
  if (!tenantId || !subsAccId || !role || !isInstance(role) || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    name,
  });

  let res: Response;
  try {
    res = await fetchMycelium(`/${role}/v1/skills/files?${query.toString()}`, {
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
