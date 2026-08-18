import { NextRequest, NextResponse } from "next/server";
import { fetchMycelium, isInstance, MyceliumConnectivityError, upstreamError } from "@/lib/mycelium";
import { clearSession, getSession } from "@/lib/session";

// background-turn-dock: which conversations on this workspace have a turn in flight?
//
// The sibling of active/route.ts, and the difference is the whole point: `active` takes
// one `session_id`, so it can confirm a conversation the client still remembers but
// cannot discover the ones a page reload made it forget. The dock has to put all of them
// back, so it needs a listing.
//
// `session_id` is therefore NOT required here. Requiring it by reflex — this file is
// otherwise a copy of active/route.ts — would leave the route unable to answer the only
// question it exists for.
//
// No `project` is forwarded, for the same reason active/route.ts documents: the proxy
// keys its in-flight registry by tenant/subs/agent/user and NOT by workspace segment, so
// project conversations are already in the answer and are told apart by session id alone.
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

  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  const subsAccId = req.nextUrl.searchParams.get("subs_acc_id");
  if (!tenantId || !subsAccId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const query = new URLSearchParams({ tenant_id: tenantId, subs_acc_id: subsAccId });

  let res: Response;
  try {
    res = await fetchMycelium(`/${instance}/v1/turns/running?${query.toString()}`, {
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

  const data = (await res.json()) as { turns?: unknown };
  const rows = Array.isArray(data.turns) ? data.turns : [];
  // Mapped rather than passed through, and always an array: the caller iterates without
  // branching on null, and an upstream row with a missing field is dropped rather than
  // docked as a chip with no conversation to open.
  const turns = rows
    .filter(
      (row): row is { session_id: string; since?: string } =>
        typeof row === "object" && row !== null && typeof (row as { session_id?: unknown }).session_id === "string",
    )
    .map((row) => ({ sessionId: row.session_id, since: row.since ?? null }));

  return NextResponse.json({ turns });
}
