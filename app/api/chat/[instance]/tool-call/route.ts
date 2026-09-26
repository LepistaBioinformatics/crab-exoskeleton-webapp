import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// ONE TOOL CALL'S FULL COMMAND AND OUTPUT.
//
// A route of its own rather than more fields on `history`, and the split is the
// point. The harness caps an event's arguments at 200 runes and never writes a
// tool result to the transcript at all -- deliberately, so that a conversation's
// history does not grow by everything the agent ever ran. Folding this into the
// history response would undo exactly that; here the weight is fetched when a
// member opens one call, and never otherwise.
//
// It mirrors `history/route.ts` parameter for parameter, because the proxy
// derives the member's directory from the identity header and reads the rest of
// the scope from these -- the same resolution, shared there as
// `resolveSessionScope`, so the two routes cannot disagree about whose records
// they are reading.

interface ToolCallResponse {
  recorded: boolean;
  record?: {
    id: string;
    call_id?: string;
    name?: string;
    arguments?: string;
    /** Absent when the turn died inside the call. That absence is information. */
    output?: string;
    status?: string;
    detail?: string;
    started_at?: string;
    ended_at?: string;
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ instance: string }> },
) {
  const { instance } = await params;
  if (!isInstance(instance)) {
    return NextResponse.json({ error: "invalid_instance" }, { status: 400 });
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "session_expired" }, { status: 401 });
  }

  const sessionId = req.nextUrl.searchParams.get("session_id");
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  const subsAccId = req.nextUrl.searchParams.get("subs_acc_id");
  const auditId = req.nextUrl.searchParams.get("audit_id");
  if (!sessionId || !tenantId || !subsAccId || !auditId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({
    session_id: sessionId,
    tenant_id: tenantId,
    subs_acc_id: subsAccId,
    audit_id: auditId,
  });
  // Same as history: forwarded so the proxy reads the project's own workspace.
  // A project's records live under its own sibling directory, so asking for the
  // main one would answer "not recorded" for every call in a project chat.
  const project = req.nextUrl.searchParams.get("project");
  if (project) query.set("project", project);

  let res: Response;
  try {
    res = await fetchMycelium(
      `/${instance}/v1/sessions/tool-call?${query.toString()}`,
      { headers: { Authorization: `Bearer ${session.token}` } },
    );
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

  // Passed through whole. `recorded: false` is an ORDINARY answer and not an
  // error: every call made before the harness minted these has no record, and
  // so does every call under picoclaw.
  const data = (await res.json()) as ToolCallResponse;
  return NextResponse.json(data);
}
