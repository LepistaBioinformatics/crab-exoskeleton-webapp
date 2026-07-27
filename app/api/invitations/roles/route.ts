import { NextRequest, NextResponse } from "next/server";
import { myceliumRpc, MyceliumConnectivityError } from "@/lib/mycelium";
import { requireSession } from "@/lib/adminProxy";

// The tenant's guest roles, which is how an agent + access level becomes a
// roleId (subscription-invitations FR-1.3). Read-only and cheap; the client
// caches it for the session because it changes only when the gateway config
// does.
//
// `guestRoles.list` answers with either a bare array or a paginated envelope
// depending on the server build, so both shapes are handled here rather than in
// every caller.
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const tenantId = req.nextUrl.searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const rpc = await myceliumRpc<unknown>(
      "subscriptionsManager.guestRoles.list",
      { tenantId },
      session.token,
    );
    if (!rpc.ok) {
      return NextResponse.json({ error: rpc.message }, { status: rpc.status });
    }
    return NextResponse.json({ roles: unwrapRecords(rpc.result) });
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }
}

function unwrapRecords(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const records = (result as { records?: unknown })?.records;
  return Array.isArray(records) ? records : [];
}
