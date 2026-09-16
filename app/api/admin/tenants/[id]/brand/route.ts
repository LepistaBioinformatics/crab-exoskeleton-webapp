import { NextRequest, NextResponse } from "next/server";
import { callRpc, requireDirectoryAdmin, str } from "@/lib/adminRpc";
import { BRAND_TAG_VALUE } from "@/lib/tenantShape";

// The tenant's brand tag -- which is how a tenant logo reaches the chat sidebar.
//
// THE SHAPE IS NOT OURS TO CHOOSE. `app/chat/tenant-brand.ts` already reads the
// tag whose `value` is "brand" and takes `meta.base64Logo` and
// `meta.primaryColor` from it. Writing any other shape here leaves the avatar
// falling back to initials with no error anywhere -- the read simply finds
// nothing.
//
// THE WHOLE META MAP GOES ON EVERY WRITE. `tags.create`/`tags.update` REPLACE the
// map rather than merging into it, so a logo write that omits `primaryColor`
// deletes the colour. The client sends the complete map it read; this route does
// not try to merge, because it does not know what else the tag carried.
//
// Note the guard differs from the tenant mutators next door:
// `tenantManager.tags.*` goes through
// `get_related_accounts_or_tenant_wide_permission_or_error`, which DOES carry the
// staff short-circuit. A staff caller can set a tenant's logo without owning the
// tenant, unlike rename or archive. That asymmetry is the gateway's, and routing
// this through an owner-only path to make it look consistent would remove a
// capability for nothing.

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireDirectoryAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const meta = body?.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // Every value must be a string: the tag's `meta` is a
  // `HashMap<String, String>` on the gateway side, and a number or a nested
  // object would be refused as a deserialization error rather than as anything
  // a person could act on.
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
    if (typeof v === "string" && v) clean[k] = v;
  }

  // An existing tag is updated in place; a tenant that never had one gets a new
  // tag. The id comes from the tenant the list already returned -- the list
  // attaches every tag with its id, so nothing has to be fetched to find it.
  const tagId = str(body?.tagId);
  const out = tagId
    ? await callRpc<unknown>(guard.session, "tenantManager.tags.update", {
        tenantId: id,
        tagId,
        value: BRAND_TAG_VALUE,
        meta: clean,
      })
    : await callRpc<unknown>(guard.session, "tenantManager.tags.create", {
        tenantId: id,
        value: BRAND_TAG_VALUE,
        meta: clean,
      });

  if (out instanceof NextResponse) return out;
  return NextResponse.json({ tag: out.result });
}
