import { NextRequest, NextResponse } from "next/server";
import { myceliumRpc, MyceliumConnectivityError } from "@/lib/mycelium";
import { requireSession } from "@/lib/adminProxy";
import type { SessionCookie } from "@/lib/session";

// Invitations to a subscription account (subscription-invitations FR-5). These
// go to mycelium's guest RPC, not to crab-shell-proxy: mycelium owns account
// membership, and the proxy only ever sees the resulting profile.
//
// Authorization is mycelium's: the RPC requires subscriptions-manager (or above)
// on the target. The admin screen hides the affordance for callers who lack it,
// but that is a convenience — the real check is server-side and this BFF
// surfaces whatever status it returns.

async function rpc<R>(
  session: SessionCookie,
  method: string,
  params: unknown,
): Promise<{ ok: true; result: R } | NextResponse> {
  try {
    const out = await myceliumRpc<R>(method, params, session.token);
    if (!out.ok) {
      return NextResponse.json({ error: out.message }, { status: out.status });
    }
    return out;
  } catch (err) {
    if (err instanceof MyceliumConnectivityError) {
      return NextResponse.json({ error: "connectivity" }, { status: 502 });
    }
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const tenantId = p.get("tenantId");
  const accountId = p.get("subsAccId");
  if (!tenantId || !accountId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const out = await rpc<unknown>(session, "subscriptionsManager.guests.listGuestOnSubscriptionAccount", {
    tenantId,
    accountId,
  });
  if (out instanceof NextResponse) return out;
  return NextResponse.json({ guests: unwrapRecords(out.result) });
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = await req.json().catch(() => null);
  const tenantId = str(body?.tenantId);
  const accountId = str(body?.subsAccId);
  const roleId = str(body?.roleId);
  const email = str(body?.email);
  if (!tenantId || !accountId || !roleId || !email) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const out = await rpc<unknown>(session, "subscriptionsManager.guests.guestUserToSubscriptionAccount", {
    tenantId,
    accountId,
    roleId,
    email,
  });
  if (out instanceof NextResponse) return out;

  // The upstream endpoint is get-or-create, so re-inviting someone is a normal
  // outcome, not a failure (FR-1.7). Its response distinguishes the two by
  // whether the record carries a `created` older than this request; the simplest
  // honest signal we can give the UI is whether a guest already existed, which
  // mycelium reports as a "Created"/"NotCreated"-style envelope on some builds.
  // When we cannot tell, we say nothing and the UI shows a plain success.
  const alreadyInvited = looksNotCreated(out.result);
  return NextResponse.json({ guest: out.result, alreadyInvited });
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const tenantId = p.get("tenantId");
  const accountId = p.get("subsAccId");
  const roleId = p.get("roleId");
  const email = p.get("email");
  if (!tenantId || !accountId || !roleId || !email) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const out = await rpc<unknown>(
    session,
    "subscriptionsManager.guests.revokeUserGuestToSubscriptionAccount",
    { tenantId, accountId, roleId, email },
  );
  if (out instanceof NextResponse) return out;
  return NextResponse.json({ status: "revoked" });
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function unwrapRecords(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const records = (result as { records?: unknown })?.records;
  return Array.isArray(records) ? records : [];
}

function looksNotCreated(result: unknown): boolean {
  const kind = (result as { kind?: unknown })?.kind;
  return typeof kind === "string" && kind.toLowerCase().includes("notcreated");
}
