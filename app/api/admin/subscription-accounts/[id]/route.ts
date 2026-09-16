import { NextRequest, NextResponse } from "next/server";
import { callRpc, requireDirectoryAdmin, str } from "@/lib/adminRpc";

// One subscription account: renamed, or deleted.
//
// THE STATUS LIFECYCLE IS NOT HERE. `userManager.account.{activate,deactivate,
// approve,disapprove,archive,unarchive}` were wired and then removed with their
// controls: the states belong to mycelium, and this screen had no reason to drive
// them. They are registered methods and can come back, but an unreachable mutation
// on an admin surface is a surface all the same -- the route is the real boundary,
// the missing button is only a convenience.

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = str(body?.action);

  if (action === "rename") {
    const tenantId = str(body?.tenantId);
    const name = str(body?.name);
    if (!tenantId || !name) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
    const out = await callRpc<unknown>(
      guard.session,
      "subscriptionsManager.accounts.updateNameAndFlags",
      { tenantId, accountId: id, name },
    );
    if (out instanceof NextResponse) return out;
    return NextResponse.json({ account: out.result });
  }

  return NextResponse.json({ error: "invalid_request" }, { status: 400 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const tenantId = str(req.nextUrl.searchParams.get("tenantId"));
  if (!tenantId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Note the namespace: deleting a subscription account is `tenantManager.*`,
  // not `subscriptionsManager.*`. Guessing the symmetric name would fail at
  // runtime looking like a permissions problem.
  const out = await callRpc<unknown>(
    guard.session,
    "tenantManager.accounts.deleteSubscriptionAccount",
    { tenantId, accountId: id },
  );
  if (out instanceof NextResponse) return out;
  return NextResponse.json({ status: "deleted" });
}
