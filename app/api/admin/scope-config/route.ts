import { NextRequest, NextResponse } from "next/server";
import { proxyAdminJson, requireSession, restartParams, withRestart } from "@/lib/adminProxy";

// Bulk instance-config administration (admin-bulk-instance-config). A passthrough
// to the proxy's /v1/admin/scope/config* endpoints, which own every rule: UUID
// parsing, agent resolution, authorization, the key charset and the managed-path
// refusal. Parameters are forwarded with no presence check on purpose -- the proxy
// audits every refusal (its FR-6.4), and a BFF 400 would be a refusal with no
// audit line.
//
// This is NOT the private-file content route admin-shared-content FR-7 forbids,
// and that instruction stands unchanged. The distinction, as the per-instance
// sibling app/api/admin/users/config/route.ts states it:
//
//   - FR-7's subject is the set the proxy's ListUserFiles enumerates, which is
//     the member's UPLOADS dir alone. config.json is not in it.
//   - FR-7 protects MEMBER-AUTHORED content. config.json is proxy-materialized
//     provisioning state at the workspace root.
//   - These routes take no file name and can address nothing but config.json.
//     Do not add one.
export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const p = req.nextUrl.searchParams;
  const query = new URLSearchParams();
  for (const key of ["tenant_id", "subs_acc_id", "agent"]) {
    const v = p.get(key);
    if (v) query.set(key, v);
  }

  // The body ({key, value, revisions, alsoTemplate?, templateRevision?}) is
  // forwarded verbatim: the proxy owns every rule about it, and it sets the
  // migration record's `by` from the authenticated caller -- that field is
  // `json:"-"` upstream, so nothing sent here could be read as provenance.
  const body = await req.text();
  return proxyAdminJson(
    session,
    withRestart(`/scope/config?${query.toString()}`, restartParams(req)),
    { method: "PUT", body, headers: { "Content-Type": "application/json" } },
  );
}
