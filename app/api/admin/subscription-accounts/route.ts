import { NextRequest, NextResponse } from "next/server";
import { callRpc, pageSize, requireDirectoryAdmin, str } from "@/lib/adminRpc";
import { records, truncated } from "@/lib/rpcRecords";

// Subscription accounts under one tenant.
//
// `tenantId` IS REQUIRED, and not merely by our own choice: for a caller who
// lands on the tenant-wide-privileges branch -- which is where staff lands --
// `list_accounts_by_type` errors with "tenant_id is required when listing
// accounts by type". There is no list-everything view for staff to fall back on.
//
// ONE `accountType` PER CALL. The reference SPA fires a JSON-RPC batch, one
// request per type, and concatenates; its own source calls the merged pagination
// best-effort, it consumes batch responses by array position rather than by id,
// and it skips a sub-request that errored without surfacing anything. A list that
// silently omits accounts is worse on an admin screen than one that shows a
// single type at a time.

export async function GET(req: NextRequest) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const p = req.nextUrl.searchParams;
  const tenantId = str(p.get("tenantId"));
  if (!tenantId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const out = await callRpc<unknown>(
    guard.session,
    "subscriptionsManager.accounts.list",
    {
      tenantId,
      term: str(p.get("term")) ?? undefined,
      accountType: str(p.get("accountType")) ?? "subscription",
      pageSize: pageSize(p.get("pageSize")),
      skip: Number(p.get("skip")) || 0,
    },
  );
  if (out instanceof NextResponse) return out;

  const accounts = records<unknown>(out.result);
  return NextResponse.json({
    accounts,
    truncated: truncated(out.result, accounts.length),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const tenantId = str(body?.tenantId);
  const name = str(body?.name);
  if (!tenantId || !name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // THIS METHOD AND NO OTHER.
  //
  // `createSubscriptionAccount` is what emits mycelium's
  // `subscriptionAccount.created` webhook, and that webhook is what calls the
  // proxy's `POST /v1/accounts` to provision the agent workspace behind the
  // account. Any other create path -- `createRoleAssociatedAccount`,
  // `createSystemAccount`, the REST twin -- produces a mycelium record with no
  // workspace behind it, and nothing anywhere reports the omission. The account
  // simply does not work, later, for someone else.
  const out = await callRpc<unknown>(
    guard.session,
    "subscriptionsManager.accounts.createSubscriptionAccount",
    { tenantId, name },
  );
  if (out instanceof NextResponse) return out;

  return NextResponse.json({ account: out.result });
}
