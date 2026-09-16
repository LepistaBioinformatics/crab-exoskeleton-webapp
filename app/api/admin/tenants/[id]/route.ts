import { NextRequest, NextResponse } from "next/server";
import { callRpc, requireDirectoryAdmin, str } from "@/lib/adminRpc";
import { tenantMutationError } from "@/lib/rpcErrors";

// One tenant: renamed, archived, verified, deleted.
//
// THE TWO GUARDS HERE ARE DIFFERENT, which is the whole reason this file needs a
// comment. `managers.tenants.delete` guards on `has_admin_privileges_or_error`,
// so staff passes. The three PATCH actions are `tenantOwner.tenant.*` and guard
// on `with_tenant_ownership_or_error`, which has NO staff bypass -- a staff caller
// who does not own this tenant is refused, and refused as INVALID_PARAMS rather
// than as a permission error, because `update_tenant_name_and_description` carries
// no Profile guard at all and scopes by `get_tenant_owned_by_me` at the
// repository. `tenantMutationError` is what turns that into copy naming both
// possibilities.

// `tenantOwner.tenant.updateVerifyingStatus` is deliberately absent: the verify
// control was removed from the screen, and a mutation reachable with no way to
// reach it is a surface all the same. The badge that reports the state stays --
// reading it is not the same as driving it.
const ACTIONS: Record<string, string> = {
  rename: "tenantOwner.tenant.updateNameAndDescription",
  archive: "tenantOwner.tenant.updateArchivingStatus",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const action = str(body?.action);
  const method = action ? ACTIONS[action] : undefined;
  if (!method) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Archive and verify are TOGGLES on the gateway side -- one method each, no
  // desired-state argument -- so the payload is the tenant alone. Rename is the
  // only one carrying fields.
  const rpcParams =
    action === "rename"
      ? {
          tenantId: id,
          name: str(body?.name) ?? undefined,
          description: str(body?.description) ?? undefined,
        }
      : { tenantId: id };

  if (action === "rename" && !str(body?.name) && !str(body?.description)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const out = await callRpc<unknown>(guard.session, method, rpcParams, tenantMutationError);
  if (out instanceof NextResponse) return out;
  return NextResponse.json({ tenant: out.result });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const out = await callRpc<unknown>(guard.session, "managers.tenants.delete", { id });
  if (out instanceof NextResponse) return out;

  // `DeletionResponseKind::Deleted` serializes as a null result. Nothing to echo.
  return NextResponse.json({ status: "deleted" });
}
