import { NextRequest, NextResponse } from "next/server";
import { callRpc, pageSize, requireDirectoryAdmin, str } from "@/lib/adminRpc";
import { records, truncated } from "@/lib/rpcRecords";
import { tenantRow } from "@/lib/tenantShape";

// Tenants, listed and created.
//
// Both methods are `managers.*`, which guards on `has_admin_privileges_or_error`
// -- staff or manager. That is the same bar `requireDirectoryAdmin` checks at the
// door, so a caller who gets past it is not expected to be refused here; a refusal
// that happens anyway is reported rather than swallowed.

export async function GET(req: NextRequest) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const p = req.nextUrl.searchParams;
  const out = await callRpc<unknown>(guard.session, "managers.tenants.list", {
    name: str(p.get("term")) ?? undefined,
    pageSize: pageSize(p.get("pageSize")),
    skip: Number(p.get("skip")) || 0,
  });
  if (out instanceof NextResponse) return out;

  // `null` here is an empty collection, not a failure: an unmatched filter
  // serializes as `FetchManyResponseKind::NotFound`, which is a null RESULT.
  const raw = records<unknown>(out.result);
  const tenants = raw
    .map((t) => tenantRow(t, guard.profile.userId))
    .filter((t) => t !== null);

  return NextResponse.json({
    tenants,
    truncated: truncated(out.result, raw.length),
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const name = str(body?.name);
  if (!name) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // THE CREATOR BECOMES THE OWNER, and this is load-bearing rather than a
  // convenience.
  //
  // `with_tenant_ownership_or_error` is the one permission helper in the gateway
  // with no staff bypass, and all four `tenantOwner.tenant.*` mutators go through
  // it. A tenant created without naming an owner the caller can act as is a
  // tenant its own creator cannot rename, archive or verify -- and the refusal
  // arrives as INVALID_PARAMS, so it does not even read as a permission problem.
  //
  // The id is resolved from the session, never accepted from the body: this is
  // the field that decides who controls the tenant.
  const ownerId = guard.profile.userId;
  if (!ownerId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const out = await callRpc<unknown>(guard.session, "managers.tenants.create", {
    name,
    description: str(body?.description) ?? undefined,
    ownerId,
  });
  if (out instanceof NextResponse) return out;

  return NextResponse.json({ tenant: out.result });
}
