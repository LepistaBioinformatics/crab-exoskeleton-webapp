// Reading a mycelium `Tenant` off the wire.
//
// Every helper here exists because a field's wire shape is not the shape its
// TypeScript name suggests. The reference webapp's own types have been wrong
// about several of these, so each one is read from the Rust DTO.

export interface TenantTag {
  id: string;
  value: string;
  meta?: Record<string, string> | null;
}

// What the directory renders for one tenant. `ownedByCaller` is ours, derived
// server-side; everything else comes from the gateway.
export interface TenantRow {
  id: string;
  name: string;
  description?: string | null;
  tags: TenantTag[];
  ownerIds: string[];
  ownedByCaller: boolean;
  archived: boolean;
  verified: boolean;
  brandLogo?: string | null;
  brandColor?: string | null;
  brandTagId?: string | null;
}

// `Children<T, Id>` is externally tagged, like `Parent` but plural:
// `{"records": [...]}` or `{"ids": [...]}`. The tenant list returns the `ids`
// variant -- `filter_tenants_as_manager` maps owners to bare uuids -- but reading
// both costs one branch and means a payload from another call does not come back
// empty for a shape reason.
export function childIds(children: unknown): string[] {
  if (!children || typeof children !== "object") return [];
  const ids = (children as { ids?: unknown }).ids;
  if (Array.isArray(ids)) return ids.filter((i): i is string => typeof i === "string");
  const records = (children as { records?: unknown }).records;
  if (Array.isArray(records)) {
    return records
      .map((r) => (r && typeof r === "object" ? (r as { id?: unknown }).id : null))
      .filter((i): i is string => typeof i === "string");
  }
  return [];
}

// `TenantStatus` is externally tagged too: `{"verified": {at, by}}`,
// `{"archived": {...}}`, `{"trashed": {...}}` -- never a plain string. A status
// array is read by asking which variant keys are present, not by comparing text.
export function hasStatus(status: unknown, variant: string): boolean {
  const entries = Array.isArray(status) ? status : status ? [status] : [];
  return entries.some(
    (e) => e && typeof e === "object" && variant in (e as Record<string, unknown>),
  );
}

export function tags(raw: unknown): TenantTag[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t) => {
    if (!t || typeof t !== "object") return [];
    const { id, value, meta } = t as { id?: unknown; value?: unknown; meta?: unknown };
    if (typeof id !== "string" || typeof value !== "string") return [];
    return [
      {
        id,
        value,
        meta:
          meta && typeof meta === "object"
            ? (meta as Record<string, string>)
            : null,
      },
    ];
  });
}

// The brand tag, which is how a tenant's logo reaches the chat sidebar.
//
// The shape is not ours to choose: `app/chat/tenant-brand.ts` already reads the
// tag whose `value` is "brand" and takes `meta.base64Logo` and
// `meta.primaryColor` from it. Writing anything else here would leave the avatar
// resolving to initials with no error anywhere.
export const BRAND_TAG_VALUE = "brand";

export function brandTag(list: TenantTag[]): TenantTag | null {
  return list.find((t) => t.value === BRAND_TAG_VALUE) ?? null;
}

export function tenantRow(raw: unknown, callerUserId: string | null): TenantRow | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  // `Tenant.id` is `Option<Uuid>` on the wire. A tenant we cannot address is a
  // row every control would fail against, so it is dropped rather than rendered.
  if (typeof t.id !== "string" || typeof t.name !== "string") return null;

  const tagList = tags(t.tags);
  const brand = brandTag(tagList);
  const ownerIds = childIds(t.owners);

  return {
    id: t.id,
    name: t.name,
    description: typeof t.description === "string" ? t.description : null,
    tags: tagList,
    ownerIds,
    ownedByCaller: !!callerUserId && ownerIds.includes(callerUserId),
    archived: hasStatus(t.status, "archived"),
    verified: hasStatus(t.status, "verified"),
    brandLogo: brand?.meta?.base64Logo ?? null,
    brandColor: brand?.meta?.primaryColor ?? null,
    brandTagId: brand?.id ?? null,
  };
}
