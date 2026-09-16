import { NextRequest, NextResponse } from "next/server";
import { callRpc, pageSize, requireDirectoryAdmin, str } from "@/lib/adminRpc";
import { records, truncated } from "@/lib/rpcRecords";

// Guest roles, LISTED ONLY.
//
// THERE IS NO WRITE HERE, AND THAT IS THE POINT. Guest roles are declared in the
// mycelium gateway's own config and propagated into the database when the gateway
// boots. `propagate_declared_roles_to_storage_engine` does that with
// `get_or_create`, which matches on `(slug, permission)` and CREATES ONLY -- it
// never updates an existing row. Every mutation from outside the config therefore
// ends badly:
//
//   create      -- makes a role no route references. It can be granted and routes
//                  nowhere, so the agent it names does not exist.
//   rename      -- the declared slug stops matching, so the next boot creates a
//                  fresh empty role beside the renamed one. The grants stay on the
//                  orphan; the gateway routes on the new one.
//   permission  -- same, because the match key includes the permission. Two rows
//                  with one slug, and the grants sit on the permission the config
//                  never declared.
//   delete      -- the role comes back empty at the next boot, and every grant made
//                  with it is gone for good.
//
// So the config file is the only place a role is created or changed, and this
// route exists to show what it produced.
//
// WHY `guestManager.*` AND NOT THE SIBLING THIS APP ALREADY CALLS. There are three
// guest-role listings in the gateway with three different guards, and they are not
// interchangeable:
//
//   guestManager.guestRoles.list          get_ids_or_error -- passes for staff and
//                                         manager, takes NO tenantId at all
//   subscriptionsManager.guestRoles.list  role-filtered to SubscriptionsManager,
//                                         and defaults tenantId to nil when omitted
//   accountManager.guestRoles.listGuestRoles  filtered to AccountManager
//
// `app/api/invitations/roles/route.ts` calls the second and should keep calling it:
// it serves the members panel, where the caller is scoped to a tenant. This area's
// caller is staff or manager and needs the global list.
//
// In this stack a role's NAME is the agent key and its permission is read or write,
// so the pair of roles for an agent is what makes that agent grantable at all.

export async function GET(req: NextRequest) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const p = req.nextUrl.searchParams;
  const out = await callRpc<unknown>(guard.session, "guestManager.guestRoles.list", {
    name: str(p.get("term")) ?? undefined,
    pageSize: pageSize(p.get("pageSize")),
    skip: Number(p.get("skip")) || 0,
  });
  if (out instanceof NextResponse) return out;

  const roles = records<unknown>(out.result);
  return NextResponse.json({
    roles,
    truncated: truncated(out.result, roles.length),
  });
}
