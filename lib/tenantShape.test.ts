import { describe, it, expect } from "vitest";
import { brandTag, childIds, hasStatus, tags, tenantRow } from "./tenantShape";

// A tenant as the gateway actually sends one: owners as the `ids` variant of an
// externally-tagged `Children`, status as externally-tagged variants carrying
// their own payloads, and the brand tag holding the logo the chat sidebar reads.
const TENANT = {
  id: "t-1",
  name: "Acme",
  description: "the customer",
  owners: { ids: ["u-1", "u-2"] },
  status: [{ verified: { at: "2026-01-01", by: "staff@localhost" } }],
  tags: [
    { id: "tag-other", value: "region", meta: { name: "south" } },
    { id: "tag-brand", value: "brand", meta: { base64Logo: "data:,x", primaryColor: "#123456" } },
  ],
};

describe("childIds", () => {
  // `Children<T, Id>` is externally tagged, like `Parent` but plural. Reading it
  // as a flat array is the same mistake that once made every guest role render
  // as "unknown".
  it("reads the ids variant", () => {
    expect(childIds({ ids: ["u-1", "u-2"] })).toEqual(["u-1", "u-2"]);
  });

  it("reads the records variant by pulling each id", () => {
    expect(childIds({ records: [{ id: "u-1" }, { id: "u-2" }] })).toEqual(["u-1", "u-2"]);
  });

  it("is empty for a shape it does not recognise", () => {
    expect(childIds(null)).toEqual([]);
    expect(childIds(["u-1"])).toEqual([]);
  });
});

describe("hasStatus", () => {
  // TenantStatus is never a plain string -- it is `{"verified": {...}}` and
  // siblings. Comparing text would find nothing and report every tenant
  // unverified.
  it("finds a variant by its wrapper key", () => {
    expect(hasStatus([{ archived: { at: "x" } }], "archived")).toBe(true);
    expect(hasStatus([{ archived: { at: "x" } }], "verified")).toBe(false);
  });

  it("accepts a single status as well as a list", () => {
    expect(hasStatus({ trashed: {} }, "trashed")).toBe(true);
  });

  it("is false when there is no status at all", () => {
    expect(hasStatus(undefined, "verified")).toBe(false);
  });
});

describe("tags", () => {
  it("keeps only entries carrying both an id and a value", () => {
    expect(tags([{ id: "a", value: "brand" }, { value: "no id" }, null])).toEqual([
      { id: "a", value: "brand", meta: null },
    ]);
  });
});

describe("brandTag", () => {
  it("finds the tag the chat sidebar reads", () => {
    expect(brandTag(tags(TENANT.tags))?.id).toBe("tag-brand");
  });

  it("is null when the tenant has no brand", () => {
    expect(brandTag(tags([{ id: "a", value: "region" }]))).toBeNull();
  });
});

describe("tenantRow", () => {
  it("reads every field the directory renders", () => {
    const row = tenantRow(TENANT, "u-2");
    expect(row).toMatchObject({
      id: "t-1",
      name: "Acme",
      ownerIds: ["u-1", "u-2"],
      verified: true,
      archived: false,
      brandLogo: "data:,x",
      brandColor: "#123456",
      brandTagId: "tag-brand",
    });
  });

  // Ownership decides whether rename, archive and verify will work at all, and it
  // is decided by comparing USER ids -- `create_tenant` stores the owner from a
  // user id, and each `profile.owners` entry is built from one.
  it("marks the caller as an owner only when their id is among the owners", () => {
    expect(tenantRow(TENANT, "u-2")?.ownedByCaller).toBe(true);
    expect(tenantRow(TENANT, "u-9")?.ownedByCaller).toBe(false);
    expect(tenantRow(TENANT, null)?.ownedByCaller).toBe(false);
  });

  // `Tenant.id` is Option<Uuid> on the wire. A row with no id is one every
  // control would fail against, so it never reaches the screen.
  it("drops a tenant it cannot address", () => {
    expect(tenantRow({ name: "no id" }, null)).toBeNull();
    expect(tenantRow(null, null)).toBeNull();
  });
});
