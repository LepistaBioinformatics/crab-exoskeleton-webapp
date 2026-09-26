import { NextRequest, NextResponse } from "next/server";
import {
  fetchMycelium,
  isInstance,
  MyceliumConnectivityError,
  skillsError,
} from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";
import type { SessionCookie } from "@/lib/session";

// BFF for the member's own skills (member-owned-skills). Top-level and keyed by
// `?role=`, like /api/memory and /api/secrets -- app/api/chat/[instance] is chat
// and sessions, and a skill is neither.
//
// HAND-ROLLED RATHER THAN ON `lib/proxyRead.ts`, and that is the whole point of
// the file. That helper forwards the project on EVERY route it serves, deliberately
// and with a comment saying why: for the panels it was written for, the project
// names which workspace directory the read addresses. The harness reads skills only
// from the main workspace (backend DEC-5), so a project-scoped skill is a file
// nothing loads -- and the helper has no way to decline. Nothing below reads, builds
// or forwards it, and `skills-no-project.test.ts` holds that.
//
// `role` selects the gateway service path and never travels upstream; tenant_id and
// subs_acc_id are what the proxy authorizes against; a 401 clears the session.
async function callSkills(
  session: SessionCookie,
  role: string,
  suffix: string,
  init: RequestInit,
): Promise<NextResponse> {
  let res: Response;
  try {
    res = await fetchMycelium(`/${role}/v1/skills${suffix}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${session.token}` },
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
  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const tenantId = p.get("tenant_id");
  const subsAccId = p.get("subs_acc_id");
  const role = p.get("role");
  if (!tenantId || !subsAccId || !role || !isInstance(role)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId });
  return callSkills(session, role, `?${query.toString()}`, { method: "GET" });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const tenantId = typeof body?.tenant_id === "string" ? body.tenant_id : null;
  const subsAccId = typeof body?.subs_acc_id === "string" ? body.subs_acc_id : null;
  const role = typeof body?.role === "string" ? body.role : null;
  const name = typeof body?.name === "string" ? body.name : null;
  // Which file inside the skill. Absent is SKILL.md, applied by the proxy rather
  // than spelled again here -- a skill is a directory, and a save that dropped the
  // path would write the member's template over the skill itself.
  const path = typeof body?.path === "string" ? body.path : "";
  const content = typeof body?.content === "string" ? body.content : null;
  // Absent means "create", which the proxy answers with a 409 if the name is
  // taken. Passed through only when the caller actually read a version, so an
  // empty string cannot turn a create into an unconditional overwrite.
  const modifiedAt = typeof body?.modifiedAt === "string" ? body.modifiedAt : "";
  if (!tenantId || !subsAccId || !role || !isInstance(role) || !name || content === null) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  return callSkills(session, role, "", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    // Rebuilt field by field, not forwarded: `role` is this layer's routing input
    // and has no business upstream, and a key nobody named here cannot be smuggled
    // into a proxy write by a caller who guessed it.
    body: JSON.stringify({
      tenant_id: tenantId,
      subs_acc_id: subsAccId,
      name,
      ...(path ? { path } : {}),
      content,
      ...(modifiedAt ? { modifiedAt } : {}),
    }),
  });
}

export async function DELETE(req: NextRequest) {
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
  return callSkills(session, role, `?${query.toString()}`, { method: "DELETE" });
}
